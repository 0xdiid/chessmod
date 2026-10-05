import { expect, mock, test } from 'claude-code/testing'

import type { Ladder, SavedGame } from '../types'
import { botById, engineFor } from './bots'
import { Chess } from './chess.js'

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Dollar = Parameters<Body>[0]
type On = Parameters<Body>[1]

type BandRoom = { working?: boolean; columns?: number }

const band = <S extends 'terminal' | 'desktop'>(surface: S, room: BandRoom = {}) =>
  ({
    plugin: 'chessmod',
    surface,
    component: 'AbovePrompt',
    props: {
      isWorking: room.working ?? true,
      hasSurvey: false,
      bodyColumns: room.columns ?? 80,
      maxRows: 20,
      scroll: { bodyRows: 20 },
    } as never,
  }) as const

type HostOptions = {
  // Whether the Maia nets are on disk.
  nets?: boolean
  // What the engine prints for a position; defaults to its first legal move.
  engine?: (fen: string) => string
  // What the store holds when the session starts.
  stored?: Record<string, unknown>
}

// Stands in for the host: engines, files, store and turns.
const stubHost = (on: On, options: HostOptions = {}) => {
  const mem: Record<string, unknown> = { ...options.stored }
  const downloads: string[] = []
  const ran: string[][] = []
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/test' })
  on('process.run', async (_$, e) => {
    const script = e.argv[0] === 'sh' && e.argv[1] === '-c' ? e.argv[2]! : ''
    const fen = /position fen (.*)/.exec(e.init?.stdin ?? '')?.[1]
    let stdout = ''
    ran.push([...e.argv])
    if (e.argv[0] === 'curl') downloads.push(e.argv.at(-1)!)
    if (script === 'uname -sm') stdout = 'Darwin arm64\n'
    else if (script.startsWith('command -v ')) stdout = `/opt/homebrew/bin/${script.slice(11)}\n`
    else if (fen) {
      const m = new Chess(fen).moves({ verbose: true })[0]!
      stdout = options.engine ? options.engine(fen) : `bestmove ${m.from}${m.to}\n`
    }
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('fs.read', async () => ({ value: 'setoption name GuideBookFile value players/ph-tal2.bin\n' }) as never)
  on('fs.write', async () => ({ value: undefined }) as never)
  on('fs.exists', async () => ({ value: options.nets ?? true }) as never)
  on('store.set', async (_$, e) => {
    mem[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.get', async (_$, e) => ({ value: mem[e.key] }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }) as never)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }) as never)
  on('tool.call', async () => ({ result: { text: 'ok' } }) as never)
  on('classic.PermissionRequest', async () => ({}) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', async (_$, e) => ({ value: { command: e.name } }) as never)
  return { game: () => mem.game as SavedGame, ladder: () => mem.ladder as Ladder, clock, downloads, ran }
}

const ready = ($: Dollar) => $.command.run({ command: 'chess', args: 'setup' } as never)
const startTurn = async ($: Dollar, host: { clock: { settle: () => Promise<void> } }) => {
  await $.turn.start({ text: 'go', turnId: 't1' })
  await host.clock.settle()
}
const resume = async ($: Dollar, host: { clock: { settle: () => Promise<void> } }) => {
  await $.session.start({ source: 'resume', cwd: '/home/test' } as never)
  await ready($)
  await startTurn($, host)
}

// Cells are 3 columns after a 2-column rank label; black's view is flipped.
const cell = (sq: string, flip: boolean) => {
  const file = 'abcdefgh'.indexOf(sq[0]!)
  const rank = Number(sq[1])
  return { x: 2 + (flip ? 7 - file : file) * 3 + 1, y: flip ? rank - 1 : 8 - rank }
}

const click = async (ui: { pointer: (e: never) => Promise<void> }, from: string, to: string, flip: boolean) => {
  await ui.pointer({ type: 'down', button: 'left', ...cell(from, flip) } as never)
  await ui.pointer({ type: 'up', button: 'left', ...cell(from, flip) } as never)
  await ui.pointer({ type: 'down', button: 'left', ...cell(to, flip) } as never)
}

const showsBoard = async (ui: { find: (q: never) => Promise<unknown> }) => (await ui.find({ type: 'Text', text: /^You $/ } as never)) !== undefined

// --- When the board shows ---

test('the board shows above the prompt only while Claude works', async ($, on) => {
  const host = stubHost(on)
  await ready($)
  await startTurn($, host)
  const working = await $.ui.mount(band('terminal'))
  expect(await showsBoard(working)).toBe(true)
  await working.unmount()

  const idle = await $.ui.mount(band('terminal', { working: false }))
  expect(await showsBoard(idle)).toBe(false)
  await idle.unmount()
})

test('/chess pins the board while idle, and again unpins it', async ($, on) => {
  stubHost(on)
  await ready($)
  await $.command.run({ command: 'chess', args: '' } as never)
  const pinned = await $.ui.mount(band('terminal', { working: false }))
  expect(await showsBoard(pinned)).toBe(true)
  await pinned.unmount()

  await $.command.run({ command: 'chess', args: '' } as never)
  const unpinned = await $.ui.mount(band('terminal', { working: false }))
  expect(await showsBoard(unpinned)).toBe(false)
  await unpinned.unmount()
})

test('a permission prompt hides the board until the tool has run', async ($, on) => {
  const host = stubHost(on)
  await ready($)
  await startTurn($, host)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } } as never)
  const asking = await $.ui.mount(band('terminal'))
  expect(await showsBoard(asking)).toBe(false)
  await asking.unmount()

  await $.tool.call({ tool: 'Bash', input: { command: 'rm -rf build' } } as never)
  const after = await $.ui.mount(band('terminal'))
  expect(await showsBoard(after)).toBe(true)
  await after.unmount()
})

test('with pieces missing the band offers one-click setup, then plays whoever can', async ($, on) => {
  // Nothing downloaded lands on disk here, so only bots on PATH engines remain playable.
  const host = stubHost(on, { nets: false })
  await $.session.start({ source: 'startup', cwd: '/home/test' } as never)
  await startTurn($, host)
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /Chess setup/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Maia networks/ })).toBeDefined()

  await ui.press({ key: 'setup' })
  expect(engineFor(botById(host.game().botId)!)).toBe('stockfish')
  expect(host.downloads.some(url => url.includes('maia-1100'))).toBe(true)
  expect(host.downloads.some(url => url.includes('rodentIV'))).toBe(true)
  expect(host.downloads.some(url => url.includes('evilgyal-6'))).toBe(true)
  expect(host.ran.some(argv => argv[1]?.endsWith('scripts/build-patricia.sh'))).toBe(true)
  await ui.unmount()
})

// --- Playing ---

test('a match plays out with clicks, resign needs two presses, and the next game starts', async ($, on) => {
  const host = stubHost(on)
  await ready($)
  await startTurn($, host)
  const ui = await $.ui.mount(band('terminal'))

  const before = host.game()
  const board = new Chess()
  for (const m of before.moves) board.move(m)
  const mv = board.moves({ verbose: true })[0]!
  await click(ui as never, mv.from, mv.to, before.color === 'b')
  expect(host.game().moves.length).toBe(before.moves.length + 2)

  await ui.press({ key: 'resign' })
  expect(host.game().result).toBeUndefined()
  await ui.press({ key: 'resign' })
  expect(await ui.find({ type: 'Text', text: /You lost \(resigned\)/ })).toBeDefined()
  expect(host.ladder().rating).toBeLessThan(250)

  await host.clock.advance(5000)
  expect(host.game().result).toBeUndefined()
  expect(host.game().botId).not.toBe(before.botId)
  await ui.unmount()
})

test('a saved game resumes in a new session and checkmate is scored as a win', async ($, on) => {
  // Scholar's mate is one click away: Qh5xf7.
  const saved: SavedGame = { botId: 'beans', color: 'w', moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'], chat: 'hi' }
  const host = stubHost(on, { stored: { game: saved, ladder: { rating: 250, peak: 250, games: [] } } })
  await resume($, host)
  const ui = await $.ui.mount(band('terminal'))

  await click(ui as never, 'h5', 'f7', false)
  expect(host.game().result).toBe('win')
  expect(host.game().reason).toBe('checkmate')
  expect(host.ladder().rating).toBeGreaterThan(250)
  expect(await ui.find({ type: 'Text', text: /You won \(checkmate\)/ })).toBeDefined()
  await ui.unmount()
})

test('a pawn reaching the last rank becomes a queen', async ($, on) => {
  const saved: SavedGame = { botId: 'beans', color: 'w', moves: ['b4', 'h6', 'b5', 'h5', 'b6', 'h4', 'bxc7', 'h3'], chat: 'hi' }
  const host = stubHost(on, { stored: { game: saved } })
  await resume($, host)
  const ui = await $.ui.mount(band('terminal'))

  await click(ui as never, 'c7', 'd8', false)
  expect(host.game().moves[8]).toBe('cxd8=Q+')
  await ui.unmount()
})

test('an engine that fails still moves, so the game never stalls', async ($, on) => {
  const saved: SavedGame = { botId: 'casey', color: 'w', moves: [], chat: 'hi' }
  const host = stubHost(on, { stored: { game: saved }, engine: () => 'readyok\n' })
  await resume($, host)
  const ui = await $.ui.mount(band('terminal'))

  // a3 is off Casey's books, so the engine is asked.
  await click(ui as never, 'a2', 'a3', false)
  expect(host.game().moves.length).toBe(2)
  expect(await ui.find({ type: 'Text', text: /engine failed \(engine sent no move\); it played a random move/ })).toBeDefined()
  await ui.unmount()
})

test('a bot whose move was left pending moves once the board shows', async ($, on) => {
  const saved: SavedGame = { botId: 'casey', color: 'b', moves: [], chat: 'hi' }
  const host = stubHost(on, { stored: { game: saved } })
  await resume($, host)
  expect(host.game().moves.length).toBe(1)
})

test('desktop shows the board with a move box', async ($, on) => {
  const host = stubHost(on)
  await ready($)
  await startTurn($, host)
  const ui = await $.ui.mount(band('desktop'))
  const g = host.game()
  const board = new Chess()
  for (const m of g.moves) board.move(m)
  await ui.input({ key: 'move', text: board.moves()[0]! })
  expect(host.game().moves.length).toBe(g.moves.length + 2)
  await ui.unmount()
})

// --- Layout ---

test('captured pieces and the material lead show beside each player', async ($, on) => {
  const saved: SavedGame = {
    botId: 'beans',
    color: 'w',
    moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qe5+', 'Be2', 'Qxe2+', 'Ngxe2'],
    chat: 'hi',
  }
  const host = stubHost(on, { stored: { game: saved } })
  await resume($, host)
  const ui = await $.ui.mount(band('desktop'))
  // White took a pawn and the queen (+6 net); black took a pawn and a bishop.
  expect(await ui.find({ type: 'Text', text: /♛♟ \+\d/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '♝♟' })).toBeDefined()
  await ui.unmount()
})

test('a narrow band drops the side column but keeps the board and status', async ($, on) => {
  const host = stubHost(on)
  await ready($)
  await startTurn($, host)
  const ui = await $.ui.mount(band('terminal', { columns: 40 }))
  expect(await showsBoard(ui)).toBe(false)
  expect(await ui.find({ type: 'Text', text: /Your move|to move|thinking/ })).toBeDefined()
  await ui.unmount()
})
