import type { Bot } from "./bots";
import { Chess } from "./chess.js";
import type { Engines, Paths, Run } from "./engine";
import { engineMove } from "./engine";

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// How far behind `color` is in material.
export const deficit = (game: Chess, color: "w" | "b") => {
  let diff = 0;
  for (const row of game.board())
    for (const sq of row)
      if (sq) diff += (sq.color === color ? -1 : 1) * VALUES[sq.type]!;
  return diff;
};

const wantsToResign = (bot: Bot, game: Chess, rand: () => number) => {
  const plies = game.history().length;
  const behind = deficit(game, game.turn());
  const lost =
    (bot.resigns === "early" && plies >= 20 && behind >= 7) ||
    (bot.resigns === "hopeless" && plies >= 24 && behind >= 12);
  return lost && rand() < 0.25;
};

const bookMove = (bot: Bot, game: Chess, rand: () => number) => {
  const played = game.history();
  const next = (bot.lines ?? [])
    .filter(
      (line) =>
        line.length > played.length &&
        played.every((san, i) => line[i] === san),
    )
    .map((line) => line[played.length]!);
  return next.length ? next[Math.floor(rand() * next.length)] : undefined;
};

export type Move = { from: string; to: string; promotion?: string }

export type Decision =
  | { kind: "resign" }
  | {
      kind: "move";
      move: string | Move;
      // Something the bot said with the move (Rodent's taunts).
      say?: string;
      // Set when the engine failed and a random legal move stood in.
      problem?: string;
    };

// Engines may castle as king-takes-rook (lc0's move stats print e1h1); chess.js wants the king's square.
export const toLegalMove = (game: Chess, uci: string): Move | undefined => {
  const from = uci.slice(0, 2);
  let to = uci.slice(2, 4);
  const piece = game.get(from as never);
  const target = game.get(to as never);
  if (piece?.type === "k" && target?.type === "r" && target.color === piece.color)
    to = `${to[0] === "h" ? "g" : "c"}${to[1]}`;
  const promotion = uci[4];
  const legal = game
    .moves({ verbose: true })
    .some((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === (promotion ?? "q")));
  return legal ? { from, to, promotion } : undefined;
};

export const decide = async (
  bot: Bot,
  game: Chess,
  run: Run,
  p: Paths,
  engines: Engines,
  rand = Math.random,
): Promise<Decision> => {
  if (wantsToResign(bot, game, rand)) return { kind: "resign" };
  const book = bookMove(bot, game, rand);
  if (book) return { kind: "move", move: book };
  const legal = game.moves();
  const random = () => legal[Math.floor(rand() * legal.length)]!;
  if (bot.wildPct && rand() * 100 < bot.wildPct) return { kind: "move", move: random() };

  // A broken engine must never stall the game: a random legal move stands in.
  let reply;
  try {
    reply = await engineMove(run, p, engines, bot.brain, game.fen(), rand);
  } catch (err) {
    return { kind: "move", move: random(), problem: err instanceof Error ? err.message : String(err) };
  }
  const move = reply.uci ? toLegalMove(game, reply.uci) : undefined;
  if (!move) return { kind: "move", move: random(), problem: `engine sent ${reply.uci ?? "no move"}` };
  return { kind: "move", move, say: reply.say };
};
