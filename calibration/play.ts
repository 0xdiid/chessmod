// Plays one game between two bots using the real decide() and engines.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Bot } from "../hooks/bots";
import { decide, deficit } from "../hooks/brain";
import * as chessMod from "../hooks/chess.js";
import { PATH, pathsFor, type Engines, type Run } from "../hooks/engine";

// chess.js has no package type, so tsx loads it as CJS; named exports land on the default.
const { Chess } = ((chessMod as any).default ?? chessMod) as typeof import("../hooks/chess.js");

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const paths = pathsFor(homedir(), ROOT);
export const engines: Engines = {
  lc0: ["/opt/homebrew/bin/lc0"],
  stockfish: ["/opt/homebrew/bin/stockfish"],
  rodent: ["arch", "-x86_64", paths.rodent],
  patricia: [paths.patricia],
};

export const run: Run = (argv, commands, env) =>
  new Promise((ok, fail) => {
    const child = spawn("sh", [paths.wrapper, ...argv], {
      env: { ...process.env, PATH, ...env },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", fail);
    child.on("close", () => ok(out));
    child.stdin.end(commands.join("\n") + "\n");
  });

// Stockfish anchors: its own strength limiter, no book.
export const anchor = (elo: number, movetimeMs = 500): Bot => ({
  id: `sf${elo}`,
  name: `SF ${elo}`,
  avatar: "",
  rating: elo,
  brain: {
    kind: "stockfish",
    options: { UCI_LimitStrength: "true", UCI_Elo: elo },
    movetimeMs,
  },
  resigns: "never",
  voice: "zen",
});

export const ANCHORS = [1320, 1600, 1900, 2200, 2500, 2800].map((e) => anchor(e, 400));

export const MAX_PLIES = 240;
// A side this far ahead in material for ADJ_PLIES consecutive plies after ADJ_FROM is scored the winner.
const ADJ_MARGIN = 9;
const ADJ_FROM = 60;
const ADJ_PLIES = 12;
// At the ply cap, a lead this big wins; anything less is a draw.
const CAP_MARGIN = 4;

export type GameResult = {
  white: string;
  black: string;
  // White's score.
  score: 1 | 0.5 | 0;
  reason: string;
  plies: number;
  problems: number;
  ms: number;
  pgn?: string;
};

export const playGame = async (white: Bot, black: Bot): Promise<GameResult> => {
  const start = Date.now();
  const game = new Chess();
  let problems = 0;
  let streak = 0;
  const done = (score: 1 | 0.5 | 0, reason: string): GameResult => ({
    white: white.id,
    black: black.id,
    score,
    reason,
    plies: game.history().length,
    problems,
    ms: Date.now() - start,
    pgn: game.history().join(" "),
  });

  for (;;) {
    if (game.isCheckmate()) return done(game.turn() === "w" ? 0 : 1, "mate");
    if (game.isStalemate()) return done(0.5, "stalemate");
    if (game.isInsufficientMaterial()) return done(0.5, "material");
    if (game.isThreefoldRepetition()) return done(0.5, "repetition");
    if (game.isDrawByFiftyMoves()) return done(0.5, "fifty");
    const plies = game.history().length;
    // Material from white's view.
    const lead = -deficit(game, "w");
    if (plies >= MAX_PLIES) {
      if (Math.abs(lead) >= CAP_MARGIN)
        return done(lead > 0 ? 1 : 0, "cap-material");
      return done(0.5, "cap");
    }
    streak = Math.abs(lead) >= ADJ_MARGIN ? streak + 1 : 0;
    if (plies >= ADJ_FROM && streak >= ADJ_PLIES)
      return done(lead > 0 ? 1 : 0, "adjudicated");

    const side = game.turn() === "w" ? white : black;
    const d = await decide(side, game, run, paths, engines);
    if (d.kind === "resign") return done(game.turn() === "w" ? 0 : 1, "resign");
    if (d.problem) problems++;
    game.move(d.move as never);
  }
};
