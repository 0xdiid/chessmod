import { describe, expect, test } from "claude-code/testing";

import { BOTS, botById, engineFor, findOpponent } from './bots'
import { decide, deficit, toLegalMove } from "./brain";
import { Chess } from "./chess.js";
import { booksIn, parsePolicy, pathsFor, samplePolicy } from './engine'
import { freshLadder, ratingDelta, recordGame } from "./rating";

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

const p = pathsFor('/home/test', '/plugin')
const engines = { lc0: ['lc0'], stockfish: ['stockfish'], rodent: ['arch', '-x86_64', '/r/rodentIV'], patricia: ['/p/patricia'] };

describe("rating", () => {
  test("even game swings by half the K factor", () => {
    expect(ratingDelta(1000, 1000, 0, "win")).toBe(20);
    expect(ratingDelta(1000, 1000, 50, "loss")).toBe(-8);
  });

  test("rating never drops below the floor", () => {
    const { ladder } = recordGame(
      freshLadder(),
      { botId: "x", botRating: 150, color: "w", result: "loss", plies: 10 },
      "now",
    );
    expect(ladder.rating).toBeGreaterThanOrEqual(100);
    expect(ladder.games.length).toBe(1);
  });
});

describe("maia policy", () => {
  const out = [
    "info string e7e5  (322 ) N:       0 (+ 0) (P: 42.30%) (WL:  -.-----)",
    "info string c7c5  (264 ) N:       0 (+ 0) (P: 12.43%) (WL:  -.-----)",
    "info string node  ( 0) N: 1 (P: 100.00%)",
    "bestmove e7e5",
  ].join("\n");

  test("parses move probabilities and skips the node summary", () => {
    expect(parsePolicy(out)).toEqual([
      { uci: "e7e5", p: 0.423 },
      { uci: "c7c5", p: 0.1243 },
    ]);
  });

  test("low temperature favors the top move; a high roll can reach the rest", () => {
    const moves = parsePolicy(out);
    expect(samplePolicy(moves, 0.1, () => 0.99)).toBe("e7e5");
    expect(samplePolicy(moves, 1, () => 0.99)).toBe("c7c5");
  });
});

describe("bots", () => {
  test("the roster climbs in rating with unique ids", () => {
    const ratings = BOTS.map((b) => b.rating);
    expect([...ratings].sort((a, b) => a - b)).toEqual(ratings);
    expect(new Set(BOTS.map((b) => b.id)).size).toBe(BOTS.length);
  });

  test("matchmaking stays within 200 and avoids a rematch", () => {
    for (let i = 0; i < 20; i++) {
      const bot = findOpponent(1500, "basil", seq(i / 20))!;
      expect(Math.abs(bot.rating - 1500)).toBeLessThanOrEqual(200);
      expect(bot.id).not.toBe("basil");
    }
  });

  test("a bot follows its book before asking the engine", async () => {
    const game = new Chess();
    game.move("e4");
    const ran: string[][] = [];
    const d = await decide(
      botById("juno")!,
      game,
      async (argv) => (ran.push(argv), "bestmove a7a6"),
      p,
      engines,
      () => 0,
    );
    expect(d).toEqual({ kind: "move", move: "e5" });
    expect(ran.length).toBe(0);
  });

  test("off book, a Maia bot runs lc0 with its net and plays a sampled move", async () => {
    const game = new Chess();
    game.move("a3");
    const ran: string[][] = [];
    const d = await decide(
      botById("casey")!,
      game,
      async (argv) => (
        ran.push(argv),
        "info string d7d5  (1) N: 0 (P: 90.00%)\nbestmove d7d5"
      ),
      p,
      engines,
      () => 0.5,
    );
    expect(ran[0]).toEqual([
      "lc0",
      "--weights=/home/test/.chessmod/weights/maia-1100.pb.gz",
    ]);
    expect(d).toEqual({
      kind: "move",
      move: { from: "d7", to: "d5", promotion: undefined },
    });
  });

  test('material deficit counts from the side asked about', () => {
    const game = new Chess('3qk3/8/8/8/8/8/8/4K3 w - - 0 30')
    expect(deficit(game, 'w')).toBe(9)
    expect(deficit(game, 'b')).toBe(-9)
  })
  test('a Stockfish bot sets its strength limit and think time', async () => {
    const game = new Chess()
    game.move('a3')
    const ran: { argv: string[]; commands: string[] }[] = []
    const d = await decide(
      botById('fisher')!,
      game,
      async (argv, commands) => (ran.push({ argv, commands }), 'bestmove e7e5'),
      p,
      engines,
      () => 0.5,
    )
    expect(ran[0]!.argv).toEqual(['stockfish'])
    expect(ran[0]!.commands).toContain('setoption name UCI_LimitStrength value true')
    expect(ran[0]!.commands).toContain('setoption name UCI_Elo value 3190')
    expect(ran[0]!.commands).toContain('go movetime 1200')
    expect(d).toEqual({ kind: 'move', move: { from: 'e7', to: 'e5', promotion: undefined } })
  })

  test('a basement bot sometimes plays a random legal move without the engine', async () => {
    const game = new Chess()
    game.move('e4')
    let asked = false
    const d = await decide(botById('beans')!, game, async () => ((asked = true), 'bestmove e7e5'), p, engines, () => 0)
    expect(asked).toBe(false)
    expect(d.kind).toBe('move')
    expect(game.moves()).toContain((d as { move: string }).move)
  })
  test('a Rodent bot loads its personality, strength and taunts', async () => {
    const game = new Chess()
    game.move('a3')
    const ran: { argv: string[]; commands: string[]; env?: Record<string, string> }[] = []
    const d = await decide(
      botById('tal')!,
      game,
      async (argv, commands, env) => (
        ran.push({ argv, commands, env }),
        "info string no 'basic.ini' - check installation, please\ninfo string Be more careful next time\ninfo string override for books path: '/x'\nbestmove e7e5"
      ),
      p,
      engines,
      () => 0.5,
    )
    expect(ran[0]!.argv).toEqual(['arch', '-x86_64', '/r/rodentIV'])
    expect(ran[0]!.commands).toContain('setoption name Personality value Tal')
    expect(ran[0]!.commands).toContain('setoption name UCI_Elo value 2250')
    expect(ran[0]!.env).toEqual({ RODENT4PERSONALITIES: '/plugin/rodent/personalities/', RODENT4BOOKS: '/home/test/.chessmod/rodent-books/' })
    expect(d).toEqual({ kind: 'move', move: { from: 'e7', to: 'e5', promotion: undefined }, say: 'Be more careful next time' })
  })

  test('a bot whose engine is missing plays on and says why', async () => {
    const game = new Chess()
    game.move('a3')
    const d = await decide(botById('tal')!, game, async () => 'bestmove e7e5', p, {}, () => 0.5)
    expect((d as { problem?: string }).problem).toBe('rodent is not installed')
  })

  test('matchmaking only offers bots whose engines are installed', () => {
    for (let i = 0; i < 20; i++) {
      const bot = findOpponent(2250, undefined, seq(i / 20), b => engineFor(b) !== 'rodent')!
      expect(engineFor(bot)).not.toBe('rodent')
    }
    expect(findOpponent(1500, undefined, Math.random, () => false)).toBeUndefined()
  })

  test('every Rodent bot names a bundled personality, and their books are found', () => {
    const names = BOTS.flatMap(b => (b.brain.kind === 'rodent' ? [b.brain.personality] : []))
    expect(names.length).toBeGreaterThan(10)
    expect(booksIn('setoption name GuideBookFile value players/ph-tal2.bin\nsetoption name MainBookFile value hist/_31to80.bin')).toEqual([
      'players/ph-tal2.bin',
      'hist/_31to80.bin',
    ])
  })
  test("lc0's king-takes-rook castling becomes a legal castle", () => {
    const game = new Chess('r1b1k2r/ppp1bppp/8/3p1n2/8/N2P4/PP1P1PPP/R1B1K2R w KQkq - 0 12')
    expect(toLegalMove(game, 'e1h1')).toEqual({ from: 'e1', to: 'g1', promotion: undefined })
    expect(toLegalMove(game, 'e1g1')).toEqual({ from: 'e1', to: 'g1', promotion: undefined })
    expect(toLegalMove(game, 'e1e5')).toBeUndefined()
  })

  test('an engine sending an illegal move gets a random legal move instead', async () => {
    const game = new Chess()
    game.move('a3')
    const d = await decide(botById('casey')!, game, async () => 'bestmove a1a8', p, engines, () => 0.5)
    expect(d.kind).toBe('move')
    expect((d as { problem?: string }).problem).toBe('engine sent a1a8')
    expect(game.moves()).toContain((d as { move: string }).move)
  })
  test('a one-node style net samples its instinct; a searching one plays its best move', async () => {
    const game = new Chess()
    game.move('a3')
    const out = 'info string d7d5  (1) N: 0 (P: 90.00%)\nbestmove e7e5'
    const ran: string[][] = []
    const tiny = await decide(botById('tiny')!, game, async (argv, commands) => (ran.push([...argv, ...commands]), out), p, engines, () => 0.5)
    expect(ran[0]).toContain('--weights=/home/test/.chessmod/weights/tinygyal-8.pb.gz')
    expect(ran[0]).toContain('go nodes 1')
    expect(tiny).toEqual({ kind: 'move', move: { from: 'd7', to: 'd5', promotion: undefined }, say: undefined })

    const mean = await decide(botById('mean')!, game, async (argv, commands) => (ran.push([...argv, ...commands]), out), p, engines, () => 0.5)
    expect(ran[1]).toContain('go nodes 100')
    expect(mean).toEqual({ kind: 'move', move: { from: 'e7', to: 'e5', promotion: undefined }, say: undefined })
  })

  test('a Patricia bot sets its skill and never sends UCI_LimitStrength', async () => {
    const game = new Chess()
    game.move('a3')
    const ran: { argv: string[]; commands: string[] }[] = []
    await decide(botById('pyro')!, game, async (argv, commands) => (ran.push({ argv, commands }), 'info string accum_loss 12\nbestmove e7e5'), p, engines, () => 0.5)
    expect(ran[0]!.argv).toEqual(['/p/patricia'])
    expect(ran[0]!.commands).toContain('setoption name Skill_Level value 16')
    expect(ran[0]!.commands.some(c => c.includes('UCI_LimitStrength'))).toBe(false)
  })
});
