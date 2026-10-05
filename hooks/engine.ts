import type { Brain } from "./bots";

export const MAIA_NETS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
export const MAIA_URL =
  "https://github.com/CSSLab/maia-chess/raw/master/maia_weights";
export const STOCKFISH_URL =
  "https://github.com/official-stockfish/Stockfish/releases/latest/download";
export const RODENT_URL =
  "https://raw.githubusercontent.com/nescitus/rodent-iv/master";
export const PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

// dkappe's style nets, trained on lichess games. They carry no license, so
// setup fetches them from their author's release URLs rather than bundling.
const GYALS = "https://github.com/dkappe/leela-chess-weights";
export const STYLE_NETS: Record<string, string> = {
  "tinygyal-8": `${GYALS}/files/4432261/tinygyal-8.pb.gz`,
  "meangirl-8": `${GYALS}/releases/download/mean-girl-8/meangirl-8.pb.gz`,
  "evilgyal-6": `${GYALS}/files/3468575/evilgyal-6.pb.gz`,
  "badgyal-8": `${GYALS}/files/3799966/badgyal-8.pb.gz`,
};

export type Engine = "stockfish" | "lc0" | "rodent" | "patricia";

// What runs each engine (argv prefix), absent when it is not installed.
export type Engines = Partial<Record<Engine, string[]>>;

export type Paths = {
  // The plugin's folder: bundled wrapper and Rodent personalities.
  root: string;
  // ~/.chessmod: downloaded engines, nets and books.
  dir: string;
  wrapper: string;
  weights: (net: number) => string;
  styleNet: (name: string) => string;
  stockfish: string;
  patricia: string;
  rodent: string;
  rodentBooks: string;
  rodentPersonalities: string;
};

export const pathsFor = (home: string, root: string): Paths => {
  const dir = `${home}/.chessmod`;
  return {
    root,
    dir,
    wrapper: `${root}/scripts/uci-once.sh`,
    weights: (net) => `${dir}/weights/maia-${net}.pb.gz`,
    styleNet: (name) => `${dir}/weights/${name}.pb.gz`,
    stockfish: `${dir}/bin/stockfish`,
    patricia: `${dir}/bin/patricia`,
    rodent: `${dir}/bin/rodentIV`,
    rodentBooks: `${dir}/rodent-books/`,
    rodentPersonalities: `${root}/rodent/personalities/`,
  };
};

// Books a Rodent personality file names, relative to the books folder.
export const booksIn = (personality: string) =>
  [
    ...personality.matchAll(
      /^setoption name (?:Guide|Main)BookFile value (\S+)/gm,
    ),
  ].map((m) => m[1]!);

// Runs one engine over UCI and returns the info strings and bestmove it printed.
export type Run = (
  argv: string[],
  commands: string[],
  env?: Record<string, string>,
) => Promise<string>;

export type EngineReply = { uci?: string; say?: string };

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

// lc0's VerboseMoveStats lists each legal move's policy as "(P: 12.34%)".
export const parsePolicy = (out: string) => {
  const moves: { uci: string; p: number }[] = [];
  for (const line of out.split("\n")) {
    const m = /^info string (\S+)\s.*\(P:\s*([\d.]+)%\)/.exec(line);
    if (m && UCI.test(m[1]!)) moves.push({ uci: m[1]!, p: Number(m[2]) / 100 });
  }
  return moves;
};

export const samplePolicy = (
  moves: { uci: string; p: number }[],
  temp: number,
  rand: () => number,
) => {
  const weights = moves.map((m) => Math.pow(m.p, 1 / temp));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < moves.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return moves[i]!.uci;
  }
  return moves[moves.length - 1]?.uci;
};

// Rodent's Taunting option prints a line of chat before its move; its startup notices are not chat.
const RODENT_NOTICES = [/^override for /, /check installation/]

export const parseTaunt = (out: string) =>
  out
    .split('\n')
    .map(line => /^info string (.+)$/.exec(line)?.[1]?.trim())
    .filter((text): text is string => !!text && !RODENT_NOTICES.some(re => re.test(text)))
    .at(-1)

// Book names the personality files spell differently from Rodent's repository.
export const BOOK_SOURCES: Record<string, string> = {
  'guide/guide.bin': 'guide.bin',
  'guide/strangler.bin': 'guide/Strangler.bin',
  'players/ph_spassky2.bin': 'players/ph-spassky2.bin',
}

const bestmove = (out: string) => /bestmove (\S+)/.exec(out)?.[1];

export const engineMove = async (
  run: Run,
  p: Paths,
  engines: Engines,
  brain: Brain,
  fen: string,
  rand: () => number,
): Promise<EngineReply> => {
  const engine: Engine = brain.kind === "maia" || brain.kind === "gyal" ? "lc0" : brain.kind;
  const argv = engines[engine];
  if (!argv) throw new Error(`${engine} is not installed`);

  if (brain.kind === "maia") {
    const out = await run(
      [...argv, `--weights=${p.weights(brain.net)}`],
      [
        "uci",
        "setoption name VerboseMoveStats value true",
        `position fen ${fen}`,
        "go nodes 1",
      ],
    );
    const policy = parsePolicy(out);
    return {
      uci:
        (policy.length ? samplePolicy(policy, brain.temp, rand) : undefined) ??
        bestmove(out),
    };
  }

  if (brain.kind === "gyal") {
    const out = await run(
      [...argv, `--weights=${p.styleNet(brain.net)}`],
      [
        "uci",
        "setoption name VerboseMoveStats value true",
        `position fen ${fen}`,
        `go nodes ${brain.nodes}`,
      ],
    );
    // One node is the net's raw instinct, sampled; more nodes is a real search.
    const policy = brain.nodes === 1 ? parsePolicy(out) : [];
    return {
      uci:
        (policy.length ? samplePolicy(policy, brain.temp, rand) : undefined) ??
        bestmove(out),
    };
  }

  if (brain.kind === "patricia") {
    // Never send UCI_LimitStrength: Patricia reads it as a Chess960 switch.
    const out = await run(argv, [
      "uci",
      `setoption name Skill_Level value ${brain.skill}`,
      `position fen ${fen}`,
      `go movetime ${brain.movetimeMs}`,
    ]);
    return { uci: bestmove(out) };
  }

  if (brain.kind === "rodent") {
    const out = await run(
      argv,
      [
        "uci",
        `setoption name Personality value ${brain.personality}`,
        "setoption name UCI_LimitStrength value true",
        `setoption name UCI_Elo value ${brain.elo}`,
        "setoption name Taunting value true",
        `position fen ${fen}`,
        `go movetime ${brain.movetimeMs}`,
      ],
      {
        RODENT4PERSONALITIES: p.rodentPersonalities,
        RODENT4BOOKS: p.rodentBooks,
      },
    );
    return { uci: bestmove(out), say: parseTaunt(out) };
  }

  const out = await run(argv, [
    "uci",
    ...Object.entries(brain.options).map(
      ([k, v]) => `setoption name ${k} value ${v}`,
    ),
    `position fen ${fen}`,
    `go movetime ${brain.movetimeMs}`,
  ]);
  return { uci: bestmove(out) };
};
