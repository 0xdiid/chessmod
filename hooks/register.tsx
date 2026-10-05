import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register, RenderChildren } from 'claude-code'

import type { Ladder, Result, SavedGame, Setup } from '../types'
import type { BoardProps } from './board'
import { COMPACT, GLYPHS, boardColumns, boardRows, drawBoard } from './board'
import type { SquareSize } from './board'
import { BOTS, botById, engineFor, findOpponent, quip } from './bots'
import type { Bot, Moment } from './bots'
import { decide } from './brain'
import { Chess } from './chess.js'
import type { Engines, Paths, Run } from './engine'
import { BOOK_SOURCES, MAIA_NETS, MAIA_URL, PATH, RODENT_URL, STOCKFISH_URL, STYLE_NETS, booksIn, pathsFor } from './engine'
import { freshLadder, ratingLabel, recordGame } from './rating'

const NEXT_GAME_MS = 4000
// Tools that stop to ask the person something.
const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])
const RODENT_PERSONALITIES = [
  ...new Set(BOTS.flatMap(b => (b.brain.kind === 'rodent' ? [b.brain.personality.toLowerCase()] : []))),
]

const ladder = atom({ plugin: 'chessmod', key: 'ladder' } as const, freshLadder())
const game = atom({ plugin: 'chessmod', key: 'game' } as const, null as SavedGame | null)
const busy = atom({ plugin: 'chessmod', key: 'busy' } as const, false)
const note = atom({ plugin: 'chessmod', key: 'note' } as const, '')
const setup = atom({ plugin: 'chessmod', key: 'setup' } as const, null as Setup | null)
// Progress of the one-click setup while it runs.
const installing = atom({ plugin: 'chessmod', key: 'installing' } as const, null as string | null)
// Whether the person ran the one-click setup; until then a partial install shows the setup screen.
const setupDone = atom({ plugin: 'chessmod', key: 'setupDone' } as const, false)
const resignArmed = atom({ plugin: 'chessmod', key: 'resignArmed' } as const, false)
// A permission prompt or question is waiting on the person: the board steps aside.
const paused = atom({ plugin: 'chessmod', key: 'paused' } as const, false)
// Pinned with /chess: the board shows while Claude is idle too.
const pinned = atom({ plugin: 'chessmod', key: 'pinned' } as const, false)

const paths = async ($: Engine) => pathsFor((await $.env.get('HOME')) ?? '/tmp', $.plugin.root)

const sh = async ($: Engine, script: string, timeoutMs = 30000) =>
  $.process.run(['sh', '-c', script], { env: { PATH }, timeoutMs })

const which = async ($: Engine, bin: string) => {
  const { exitCode, stdout } = await sh($, `command -v ${bin}`)
  return exitCode === 0 ? stdout.trim() : undefined
}

const platformOf = (uname: string): Setup['platform'] => {
  if (uname.startsWith('Darwin')) return uname.includes('arm64') ? 'mac-arm' : 'mac-intel'
  if (uname.startsWith('Linux')) return uname.includes('aarch64') ? 'linux-arm' : 'linux-x64'
  return 'other'
}

// Finds each engine, Maia net and Rodent book, preferring what is on PATH over our downloads.
const checkSetup = async ($: Engine): Promise<Setup> => {
  const p = await paths($)
  const platform = platformOf((await sh($, 'uname -sm')).stdout.trim())
  const engines: Engines = {}

  const stockfish = (await which($, 'stockfish')) ?? ((await $.fs.exists(p.stockfish)) ? p.stockfish : undefined)
  if (stockfish) engines.stockfish = [stockfish]
  const lc0 = await which($, 'lc0')
  if (lc0) engines.lc0 = [lc0]

  // Rodent ships an Intel macOS binary; Apple Silicon runs it through Rosetta.
  const rosetta = platform === 'mac-arm' ? (await sh($, 'arch -x86_64 /usr/bin/true')).exitCode === 0 : platform === 'mac-intel'
  if (rosetta && (await $.fs.exists(p.rodent))) engines.rodent = platform === 'mac-arm' ? ['arch', '-x86_64', p.rodent] : [p.rodent]

  if (await $.fs.exists(p.patricia)) engines.patricia = [p.patricia]
  // Patricia is built from source, which takes git, make and a C++ compiler.
  const toolchain = !!(await which($, 'git')) && !!(await which($, 'make')) && !!(await which($, 'c++'))

  const missingNets: number[] = []
  for (const net of MAIA_NETS) if (!(await $.fs.exists(p.weights(net)))) missingNets.push(net)
  const missingStyleNets: string[] = []
  for (const net of Object.keys(STYLE_NETS)) if (!(await $.fs.exists(p.styleNet(net)))) missingStyleNets.push(net)

  const books = new Set<string>()
  for (const name of RODENT_PERSONALITIES) for (const b of booksIn(await $.fs.read(`${p.rodentPersonalities}${name}.txt`))) books.add(b)
  const missingBooks: string[] = []
  for (const b of books) if (!(await $.fs.exists(`${p.rodentBooks}${b}`))) missingBooks.push(b)

  return { platform, engines, rosetta, toolchain, brew: !!(await which($, 'brew')), missingNets, missingStyleNets, missingBooks }
}

const isPlayable = (s: Setup | null) => (bot: Bot) => {
  if (!s || !s.engines[engineFor(bot)]) return false
  if (bot.brain.kind === 'maia') return !s.missingNets.includes(bot.brain.net)
  if (bot.brain.kind === 'gyal') return !s.missingStyleNets.includes(bot.brain.net)
  return true
}

const rodentPossible = (s: Setup) => s.platform === 'mac-arm' || s.platform === 'mac-intel'

const isComplete = (s: Setup) =>
  !!s.engines.stockfish &&
  !!s.engines.lc0 &&
  s.missingNets.length === 0 &&
  s.missingStyleNets.length === 0 &&
  (!!s.engines.patricia || !s.toolchain) &&
  (!!s.engines.rodent || !rodentPossible(s))

// The board is for playing once something can play and setup was finished or never needed.
const canPlay = async ($: Engine) => {
  const s = await read($, setup)
  if (!s || !BOTS.some(isPlayable(s))) return false
  return isComplete(s) || (await read($, setupDone))
}

const STOCKFISH_ASSET: Partial<Record<Setup['platform'], string>> = {
  'mac-arm': 'stockfish-macos-universal',
  'mac-intel': 'stockfish-macos-universal',
  'linux-x64': 'stockfish-linux-x86-64-universal',
  'linux-arm': 'stockfish-linux-arm64-universal',
}

const curl = async ($: Engine, url: string, to: string) => {
  const { exitCode, stderr } = await $.process.run(['curl', '-sSfL', '--create-dirs', '-o', to, url], {
    env: { PATH },
    timeoutMs: 300000,
  })
  return exitCode === 0 ? undefined : stderr.trim() || `curl exited ${exitCode}`
}

// The one-click setup: downloads what it can, installs lc0 through Homebrew, reports what is left.
const install = async ($: Engine) => {
  if (await read($, installing)) return
  const problems: string[] = []
  const step = (text: string) => update($, installing, () => text)
  try {
    const p = await paths($)
    const s = await checkSetup($)

    for (const net of s.missingNets) {
      await step(`Downloading Maia ${net}...`)
      const err = await curl($, `${MAIA_URL}/maia-${net}.pb.gz`, p.weights(net))
      if (err) problems.push(`Maia ${net}: ${err}`)
    }

    const asset = STOCKFISH_ASSET[s.platform]
    if (!s.engines.stockfish && asset) {
      await step('Downloading Stockfish (about 80MB)...')
      const tgz = `${p.dir}/stockfish.tar.gz`
      const err = await curl($, `${STOCKFISH_URL}/${asset}.tar.gz`, tgz)
      if (err) problems.push(`Stockfish: ${err}`)
      else {
        const { exitCode, stderr } = await sh(
          $,
          `cd "${p.dir}" && tar xzf stockfish.tar.gz && mkdir -p bin && mv "stockfish/${asset}" bin/stockfish && chmod +x bin/stockfish && rm -rf stockfish stockfish.tar.gz`,
          120000,
        )
        if (exitCode !== 0) problems.push(`Stockfish: ${stderr.trim()}`)
      }
    }

    for (const net of s.missingStyleNets) {
      await step(`Downloading the ${net} network...`)
      const err = await curl($, STYLE_NETS[net]!, p.styleNet(net))
      if (err) problems.push(`${net}: ${err}`)
    }

    if (!s.engines.patricia) {
      if (s.toolchain) {
        await step('Building Patricia (about 15 seconds)...')
        const { exitCode, stderr } = await $.process.run(['sh', `${p.root}/scripts/build-patricia.sh`, p.dir], {
          env: { PATH },
          timeoutMs: 300000,
        })
        if (exitCode !== 0) problems.push(`Patricia: ${stderr.trim().split('\n').at(-1)}`)
      } else problems.push('Patricia needs git, make and a C++ compiler (xcode-select --install)')
    }

    if (!s.engines.lc0) {
      if (s.brew) {
        await step('Installing lc0 with Homebrew (a few minutes)...')
        const { exitCode, stderr } = await sh($, 'brew install lc0', 600000)
        if (exitCode !== 0) problems.push(`lc0: ${stderr.trim().split('\n').at(-1)}`)
      } else problems.push('lc0: install it with your package manager (https://lczero.org)')
    }

    if (s.platform === 'mac-arm' || s.platform === 'mac-intel') {
      if (!s.rosetta) problems.push('Rodent bots need Rosetta: softwareupdate --install-rosetta --agree-to-license')
      else if (!s.engines.rodent) {
        await step('Downloading Rodent...')
        const err = await curl($, `${RODENT_URL}/mac/rodentIV`, p.rodent)
        if (err) problems.push(`Rodent: ${err}`)
        else await $.process.run(['chmod', '+x', p.rodent])
      }
      for (const [i, book] of s.missingBooks.entries()) {
        await step(`Downloading Rodent books (${i + 1}/${s.missingBooks.length})...`)
        await curl($, `${RODENT_URL}/books/${BOOK_SOURCES[book] ?? book}`, `${p.rodentBooks}${book}`)
      }
    }

    const after = await checkSetup($)
    await update($, setup, () => after)
    await $.store.set('setupDone', true)
    await update($, setupDone, () => true)
    await update($, note, () => (problems.length ? problems.join('\n') : ''))
  } catch (err) {
    await update($, note, () => `Setup failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await update($, installing, () => null)
  }
}

const runner =
  ($: Engine, p: Paths): Run =>
  async (argv, commands, env = {}) => {
    const { stdout } = await $.process.run(['sh', p.wrapper, ...argv], {
      stdin: [...commands, ''].join('\n'),
      env: { PATH, ...env },
      timeoutMs: 45000,
    })
    return stdout
  }

const replay = (moves: string[]) => {
  const g = new Chess()
  for (const m of moves) g.move(m)
  return g
}

const isActive = (g: SavedGame | null): g is SavedGame & { result: undefined } => !!g && !g.result

const outcome = (g: Chess, player: 'w' | 'b'): { result: Result; reason: string } | undefined => {
  if (g.isCheckmate()) return { result: g.turn() === player ? 'loss' : 'win', reason: 'checkmate' }
  if (g.isStalemate()) return { result: 'draw', reason: 'stalemate' }
  if (g.isInsufficientMaterial()) return { result: 'draw', reason: 'insufficient material' }
  if (g.isThreefoldRepetition()) return { result: 'draw', reason: 'repetition' }
  if (g.isDraw()) return { result: 'draw', reason: 'fifty-move rule' }
  return undefined
}

const persist = async ($: Engine) => {
  await $.store.set('ladder', await read($, ladder))
  await $.store.set('game', await read($, game))
}

const startMatch = async ($: Engine) => {
  const prev = await read($, game)
  if (isActive(prev)) return
  const bot = findOpponent((await read($, ladder)).rating, prev?.botId, Math.random, isPlayable(await read($, setup)))
  if (!bot) return update($, note, () => 'No bots can play yet: finish setup.')
  const color: 'w' | 'b' = Math.random() < 0.5 ? 'w' : 'b'
  await update($, game, () => ({ botId: bot.id, color, moves: [], chat: quip(bot, 'greet') }))
  await update($, note, () => '')
  await persist($)
  if (color === 'b') await botTurn($)
}

const finish = async ($: Engine, result: Result, reason: string) => {
  const g = await read($, game)
  if (!isActive(g)) return
  const bot = botById(g.botId)!
  const { ladder: next, record } = recordGame(
    await read($, ladder),
    { botId: bot.id, botRating: bot.rating, color: g.color, result, plies: g.moves.length },
    new Date().toISOString(),
  )
  const moment: Moment =
    reason.endsWith('resigned') && result === 'win' ? 'resign' : result === 'win' ? 'lose' : result === 'loss' ? 'win' : 'draw'
  await update($, ladder, () => next)
  await update($, game, s => s && { ...s, result, reason, delta: record.delta, chat: quip(bot, moment) })
  await update($, resignArmed, () => false)
  await persist($)
  void (async () => {
    await $.clock.sleep(NEXT_GAME_MS)
    await startMatch($)
  })().catch(() => undefined)
}

const botTurn = async ($: Engine) => {
  const g0 = await read($, game)
  if (!isActive(g0) || (await read($, busy))) return
  const board = replay(g0.moves)
  if (board.turn() === g0.color) return
  const bot = botById(g0.botId)!
  await update($, busy, () => true)
  try {
    const p = await paths($)
    const decision = await decide(bot, board, runner($, p), p, (await read($, setup))?.engines ?? {})
    // The game may have been resigned or replaced while the engine thought.
    const now = await read($, game)
    if (!isActive(now) || now.moves.length !== g0.moves.length || now.botId !== g0.botId) return
    if (decision.kind === 'resign') {
      await update($, busy, () => false)
      return finish($, 'win', `${bot.name} resigned`)
    }
    const mv = board.move(decision.move)
    if (decision.problem) await update($, note, () => `${bot.name}'s engine failed (${decision.problem}); it played a random move.`)
    let chat = now.chat
    if (decision.say && Math.random() < 0.5) chat = decision.say
    else if (board.inCheck() && Math.random() < 0.5) chat = quip(bot, 'check')
    else if (mv.captured && Math.random() < 0.3) chat = quip(bot, 'capture')
    await update($, game, s => s && { ...s, moves: [...s.moves, mv.san], chat })
    await persist($)
    const end = outcome(board, g0.color)
    await update($, busy, () => false)
    if (end) await finish($, end.result, end.reason)
  } catch (err) {
    await update($, note, () => `Engine error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await update($, busy, () => false)
  }
}

const playerMove = async ($: Engine, move: string | { from: string; to: string }) => {
  const g0 = await read($, game)
  if (!isActive(g0) || (await read($, busy))) return
  const board = replay(g0.moves)
  if (board.turn() !== g0.color) return
  let mv
  try {
    // Pawns always promote to a queen.
    mv = board.move(typeof move === 'string' ? move.trim() : { ...move, promotion: 'q' })
  } catch {
    return update($, note, () => `Illegal move: ${typeof move === 'string' ? move : `${move.from}${move.to}`}`)
  }
  await update($, note, () => '')
  await update($, resignArmed, () => false)
  await update($, game, s => s && { ...s, moves: [...s.moves, mv.san] })
  await persist($)
  const end = outcome(board, g0.color)
  if (end) return finish($, end.result, end.reason)
  await botTurn($)
}

// Gets a game going, or the bot moving, whenever the board comes into view.
const wake = async ($: Engine) => {
  if (!(await read($, setup))) {
    const fresh = await checkSetup($)
    await update($, setup, () => fresh)
  }
  if (!(await canPlay($))) return
  if (!isActive(await read($, game))) await startMatch($)
  else await botTurn($)
}

const boardProps = (board: Chess, g: SavedGame, locked: boolean, size: SquareSize): BoardProps => {
  const legal: Record<string, string[]> = {}
  if (!locked) for (const m of board.moves({ verbose: true })) (legal[m.from] ??= []).push(m.to)
  const last = board.history({ verbose: true }).at(-1)
  return {
    squares: board
      .board()
      .flat()
      .map(sq => (sq ? `${sq.color}${sq.type.toUpperCase()}` : '')),
    legal,
    lastMove: last ? [last.from, last.to] : [],
    flip: g.color === 'b',
    size,
  }
}

const START_COUNTS: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 }
const VALUES: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 }

// The pieces each side has taken, as glyphs, and white's material lead.
const captures = (board: Chess) => {
  const left: Record<'w' | 'b', Record<string, number>> = { w: {}, b: {} }
  for (const sq of board.board().flat()) if (sq) left[sq.color][sq.type] = (left[sq.color][sq.type] ?? 0) + 1
  const taken = (victim: 'w' | 'b') =>
    Object.keys(START_COUNTS)
      .map(t => GLYPHS[t]!.repeat(Math.max(0, START_COUNTS[t]! - (left[victim][t] ?? 0))))
      .join('')
  const material = (color: 'w' | 'b') => Object.entries(left[color]).reduce((sum, [t, n]) => sum + (VALUES[t] ?? 0) * n, 0)
  return { w: taken('b'), b: taken('w'), advantage: material('w') - material('b') }
}

// A few words on how the bot plays.
const styleOf = (bot: Bot) => {
  if (bot.brain.kind === 'maia') return bot.wildPct ? 'erratic human' : 'human-like'
  if (bot.brain.kind === 'stockfish') return 'engine'
  if (bot.brain.kind === 'gyal') return 'online hustler'
  if (bot.brain.kind === 'patricia') return 'sacrifices'
  return bot.brain.personality === bot.name ? 'in his style' : bot.brain.personality.toLowerCase()
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

const loadSaved = async ($: Engine) => {
  const savedLadder = (await $.store.get('ladder')) as Ladder | undefined
  const savedGame = (await $.store.get('game')) as SavedGame | null | undefined
  if (savedLadder && Number.isFinite(savedLadder.rating) && Array.isArray(savedLadder.games)) await update($, ladder, () => savedLadder)
  if (savedGame && Array.isArray(savedGame.moves) && botById(savedGame.botId)) await update($, game, () => savedGame)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'chess',
      description: 'Pin or unpin the chess board (it shows by itself while Claude works)',
      argumentHint: '[setup]',
      immediate: true,
    })
    await loadSaved($)
    const done = (await $.store.get('setupDone')) === true
    await update($, setupDone, () => done)
    await update($, busy, () => false)
    $.ui.status(undefined)
    void (async () => {
      try {
        const fresh = await checkSetup($)
        await update($, setup, () => fresh)
      } catch (err) {
        await update($, note, () => `Setup check failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      // The module can unload (reload, session end) before the check finishes.
    })().catch(() => undefined)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    await update($, paused, () => false)
    void wake($).catch(() => undefined)
    return started
  })

  // Fires only when the permission dialog is shown, after rules and auto mode had their say.
  on('classic.PermissionRequest', async ($, e, next) => {
    await update($, paused, () => true)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (ASKING_TOOLS.has(e.tool)) await update($, paused, () => true)
    const result = await next(e)
    await update($, paused, () => false)
    return result
  })

  on('command.run', { command: 'chess' }, async ($, e) => {
    if (e.args.trim() === 'setup') {
      await install($)
      const problems = await read($, note)
      return { text: problems ? `Chess setup finished with problems:\n${problems}` : 'Chess setup complete.' }
    }
    const pin = !(await read($, pinned))
    await update($, pinned, () => pin)
    if (pin) await wake($)
    return { text: pin ? 'Chess board pinned above the prompt. /chess again to unpin.' : 'Chess board unpinned: it shows while Claude works.' }
  })

  on('ui.message', async ($, e) => {
    if (e.element !== 'board') return {}
    const { from, to } = e.data as { from: string; to: string }
    await playerMove($, { from, to })
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = (await read($, pinned)) || e.props.isWorking
    if (e.props.hasSurvey || (await read($, paused)) || !shown) return next(e)

    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text>Chess needs the terminal or the desktop app.</Text>
    }
    const { Box, Text, Input, Button } = $.ui.resolve(e)
    const s = await read($, setup)
    const g = await read($, game)

    if (!s) return <Text dimColor>Checking engines...</Text>
    if (!(await canPlay($)) || !g) {
      const progress = await read($, installing)
      const problems = await read($, note)
      const row = (ok: boolean, text: string) => <Text color={ok ? 'green' : undefined}>{`${ok ? '✓' : '·'} ${text}`}</Text>
      return (
        <Box flexDirection="column">
          <Text bold>Chess setup</Text>
          {row(!!s.engines.stockfish, 'Stockfish, for the top bots (about 80MB)')}
          {row(!!s.engines.lc0, s.brew ? 'lc0, for the Maia bots (installed with Homebrew)' : 'lc0, for the Maia bots (install it yourself: lczero.org)')}
          {row(s.missingNets.length === 0, 'Maia networks (about 12MB)')}
          {row(s.missingStyleNets.length === 0, 'Style networks for the hustler bots (about 9MB)')}
          {row(!!s.engines.patricia, s.toolchain ? 'Patricia, built from source (about 15 seconds)' : 'Patricia needs git, make and a compiler')}
          {rodentPossible(s) && row(!!s.engines.rodent, s.rosetta ? 'Rodent, for the personality bots (about 25MB)' : 'Rodent needs Rosetta first')}
          {progress ? (
            <Text dimColor>{progress}</Text>
          ) : (
            <Button key="setup" variant="primary" onPress={() => void (async () => {
              await install($)
              if ((await canPlay($)) && !isActive(await read($, game))) await startMatch($)
            })()}>
              {isComplete(s) || BOTS.some(isPlayable(s)) ? 'Finish setup and play' : 'Set up'}
            </Button>
          )}
          {problems && <Text color="yellow">{problems}</Text>}
        </Box>
      )
    }

    const lad = await read($, ladder)
    const bot = botById(g.botId)!
    const board = replay(g.moves)
    const thinking = await read($, busy)
    const myTurn = isActive(g) && board.turn() === g.color
    const message = await read($, note)
    const armed = await read($, resignArmed)

    // The band stays short: compact squares, with everything else in a column beside them.
    const size = COMPACT
    const props = boardProps(board, g, !myTurn || thinking, size)
    const boardView =
      e.surface === 'terminal'
        ? (() => {
            const { Client } = $.ui.resolve(e)
            return <Client key="board" module="./board.tsx" props={props} width={boardColumns(size)} height={boardRows(size)} />
          })()
        : (drawBoard(Box as never, Text as never, { ...props, legal: {} }) as RenderChildren)

    let status: string
    if (g.result) {
      const verb = g.result === 'win' ? 'You won' : g.result === 'loss' ? 'You lost' : 'Draw'
      status = `${verb} (${g.reason}) ${signed(g.delta ?? 0)}`
    } else if (thinking) status = `${bot.name} is thinking...`
    else status = myTurn ? 'Your move' : `${bot.name} to move`

    const taken = captures(board)
    const botColor = g.color === 'w' ? 'b' : 'w'
    const lead = (color: 'w' | 'b') => {
      const diff = color === 'w' ? taken.advantage : -taken.advantage
      return diff > 0 ? ` +${diff}` : ''
    }
    const resign = isActive(g) ? (
      <Button
        key="resign"
        plain
        onPress={() => void (armed ? finish($, 'loss', 'resigned') : update($, resignArmed, () => true))}
      >
        {armed ? 'Really resign?' : 'Resign'}
      </Button>
    ) : (
      <Text dimColor>next game soon</Text>
    )
    const statusLine = (
      <Text bold={myTurn} color={g.result === 'win' ? 'green' : g.result === 'loss' ? 'red' : undefined}>
        {status}
      </Text>
    )
    const infoWidth = (e.props.bodyColumns ?? 80) - boardColumns(size) - 2

    // Too narrow for a side column: the board, then one line of status.
    if (infoWidth < 20) {
      return (
        <Box flexDirection="column">
          {boardView}
          <Box flexDirection="row" justifyContent="space-between" width={boardColumns(size)}>
            {statusLine}
            {resign}
          </Box>
          {message && <Text color="red">{message}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Box flexDirection="column" justifyContent="space-between" width={infoWidth} height={boardRows(size)}>
            <Box flexDirection="column">
              <Text wrap="truncate-end">
                <Text bold>{`${bot.avatar} ${bot.name} `}</Text>
                <Text dimColor>{`${bot.rating} · ${styleOf(bot)}`}</Text>
              </Text>
              <Text dimColor>{`${taken[botColor]}${lead(botColor)}`}</Text>
              <Text italic dimColor>{`"${g.chat}"`}</Text>
            </Box>
            <Box flexDirection="column">
              <Text dimColor>{`${taken[g.color]}${lead(g.color)}`}</Text>
              <Text>
                <Text bold>You </Text>
                <Text dimColor>{ratingLabel(lad)}</Text>
              </Text>
              {statusLine}
              {resign}
            </Box>
          </Box>
          <Box marginLeft={2}>{boardView}</Box>
        </Box>
        {message && <Text color="red">{message}</Text>}
        {e.surface === 'desktop' && myTurn && (
          <Input key="move" placeholder="Type a move (e4, Nf3, O-O)" onSubmit={(v: string) => void playerMove($, v)} />
        )}
      </Box>
    )
  })
}
