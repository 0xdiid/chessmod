export type Voice = "shy" | "cocky" | "grumpy" | "cheery" | "zen";
export type Resigns = "never" | "hopeless" | "early";

export type Brain =
  // Samples Maia's policy: temp 1 plays like the humans it learned from, lower is more principled.
  | { kind: "maia"; net: number; temp: number }
  // One of dkappe's style nets on lc0: 1 node samples its instinct, more nodes search.
  | { kind: "gyal"; net: string; nodes: number; temp: number }
  // Patricia, an aggressive engine that prefers sacrifices when weakened; Skill_Level 1-20.
  | { kind: "patricia"; skill: number; movetimeMs: number }
  // A Rodent IV personality at a UCI_Elo between 800 and 2800.
  | { kind: "rodent"; personality: string; elo: number; movetimeMs: number }
  | {
      kind: "stockfish";
      options: Record<string, string | number>;
      movetimeMs: number;
    };

export type Bot = {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  brain: Brain;
  // % chance per move of a uniformly random legal move; makes the basement beatable.
  wildPct?: number;
  // SAN lines from the start; the bot plays the next move while the game follows one.
  lines?: string[][];
  resigns: Resigns;
  voice: Voice;
};

// Stockfish's limiter plays below its label at short move times; stretch to compensate.
const limited = (label: number, movetimeMs: number): Brain => ({
  kind: "stockfish",
  options: {
    UCI_LimitStrength: "true",
    UCI_Elo: Math.min(3190, Math.round(label + 100 + (label - 1350) * 0.55)),
  },
  movetimeMs,
});

const rodent = (personality: string, elo: number, movetimeMs = 700): Brain => ({
  kind: "rodent",
  personality,
  elo,
  movetimeMs,
});

const gyal = (net: string, nodes: number, temp = 1): Brain => ({
  kind: "gyal",
  net,
  nodes,
  temp,
});

const patricia = (skill: number, movetimeMs = 400): Brain => ({
  kind: "patricia",
  skill,
  movetimeMs,
});

const maia = (net: number, temp: number): Brain => ({
  kind: "maia",
  net,
  temp,
});

const LONDON = [
  ["d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3"],
  ["d4", "Nf6", "Bf4", "e6", "e3", "d5", "Nf3"],
];
const QUEENS_GAMBIT = [
  ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5"],
  ["d4", "Nf6", "c4", "e6", "Nf3", "d5", "Nc3"],
];
const ITALIAN = [
  ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3"],
  ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Bc5", "c3"],
];
const RUY_LOPEZ = [
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O"],
];
const KINGS_GAMBIT = [["e4", "e5", "f4", "exf4", "Nf3", "g5", "Bc4"]];
const WING_GAMBIT = [["e4", "c5", "b4", "cxb4", "a3"]];
const SCOTCH = [["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"]];
const OPEN_SICILIAN = [
  ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3"],
];
const NAJDORF = [
  ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
];
const CARO_KANN = [
  ["e4", "c6", "d4", "d5", "e5", "Bf5"],
  ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4"],
];
const FRENCH = [
  ["e4", "e6", "d4", "d5", "e5", "c5"],
  ["e4", "e6", "d4", "d5", "Nc3", "Nf6"],
];
const SCANDINAVIAN = [["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5"]];
const KINGS_INDIAN = [["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6"]];
const SLAV = [["d4", "d5", "c4", "c6", "Nf3", "Nf6"]];
const DUTCH = [["d4", "f5", "g3", "Nf6", "Bg2", "e6"]];
const FLANK = [
  ["b3", "e5", "Bb2", "Nc6", "e3"],
  ["g3", "d5", "Bg2", "Nf6", "Nf3"],
  ["Nf3", "d5", "g3", "Nf6", "Bg2"],
];
const HYPERMODERN = [
  ["e4", "g6", "d4", "Bg7", "Nc3", "d6"],
  ["d4", "b6", "e4", "Bb7", "Nc3", "e6"],
];

const LADDER: Bot[] = [
  // The basement: Maia 1100's human instincts, diluted with random moves.
  {
    id: "beans",
    name: "Beans",
    avatar: "🐌",
    rating: 100,
    brain: maia(1100, 1.4),
    wildPct: 45,
    resigns: "never",
    voice: "cheery",
  },
  {
    id: "doug",
    name: "Doug",
    avatar: "🐢",
    rating: 200,
    brain: maia(1100, 1.4),
    wildPct: 41,
    resigns: "never",
    voice: "zen",
  },
  {
    id: "mochi",
    name: "Mochi",
    avatar: "🐁",
    rating: 325,
    brain: maia(1100, 1.3),
    wildPct: 37,
    resigns: "never",
    voice: "shy",
  },
  {
    id: "nib",
    name: "Nib",
    avatar: "🐜",
    rating: 150,
    brain: maia(1100, 1.3),
    wildPct: 33,
    resigns: "never",
    voice: "grumpy",
  },
  {
    id: "tato",
    name: "Tato",
    avatar: "🦔",
    rating: 300,
    brain: maia(1100, 1.2),
    wildPct: 28,
    resigns: "never",
    voice: "cheery",
    lines: [["e4"], ["h4", "e5", "h5"]],
  },
  {
    id: "pip",
    name: "Pip",
    avatar: "🐛",
    rating: 450,
    brain: maia(1100, 1.2),
    wildPct: 24,
    resigns: "never",
    voice: "cocky",
    lines: SCANDINAVIAN,
  },
  {
    id: "wren",
    name: "Wren",
    avatar: "🐦",
    rating: 550,
    brain: maia(1100, 1.2),
    wildPct: 22,
    resigns: "never",
    voice: "shy",
    lines: ITALIAN,
  },
  {
    id: "momo",
    name: "Momo",
    avatar: "🐹",
    rating: 625,
    brain: maia(1100, 1.1),
    wildPct: 18,
    resigns: "never",
    voice: "cocky",
    lines: WING_GAMBIT,
  },
  {
    id: "fig",
    name: "Fig",
    avatar: "🐸",
    rating: 700,
    brain: maia(1100, 1.1),
    wildPct: 14,
    resigns: "never",
    voice: "zen",
    lines: LONDON,
  },
  {
    id: "penny",
    name: "Penny",
    avatar: "🐣",
    rating: 650,
    brain: maia(1100, 1.1),
    wildPct: 12,
    resigns: "never",
    voice: "cheery",
    lines: ITALIAN,
  },
  {
    id: "ollie",
    name: "Ollie",
    avatar: "🦦",
    rating: 725,
    brain: maia(1100, 1),
    wildPct: 10,
    resigns: "hopeless",
    voice: "zen",
    lines: [...LONDON, ...CARO_KANN],
  },
  {
    id: "ziggy",
    name: "Ziggy",
    avatar: "🦜",
    rating: 575,
    brain: maia(1100, 1),
    wildPct: 8,
    resigns: "hopeless",
    voice: "cocky",
    lines: [...KINGS_GAMBIT, ...WING_GAMBIT, ...SCANDINAVIAN],
  },
  {
    id: "juju",
    name: "Juju",
    avatar: "🐒",
    rating: 775,
    brain: maia(1100, 1),
    wildPct: 5,
    resigns: "hopeless",
    voice: "cheery",
    lines: HYPERMODERN,
  },
  // Maia's home range: one net per rating band, human mistakes included.
  {
    id: "casey",
    name: "Casey",
    avatar: "🐶",
    rating: 875,
    brain: maia(1100, 1),
    resigns: "hopeless",
    voice: "cheery",
    lines: [...ITALIAN, ...FRENCH],
  },
  {
    id: "bram",
    name: "Bram",
    avatar: "🦫",
    rating: 975,
    brain: maia(1200, 1),
    resigns: "hopeless",
    voice: "grumpy",
    lines: [...LONDON, ...SLAV],
  },
  {
    id: "juno",
    name: "Juno",
    avatar: "🐰",
    rating: 1125,
    brain: maia(1300, 1),
    resigns: "hopeless",
    voice: "shy",
    lines: [...SCOTCH, ...CARO_KANN],
  },
  {
    id: "cleo",
    name: "Cleo",
    avatar: "🦊",
    rating: 1100,
    brain: maia(1300, 0.8),
    resigns: "hopeless",
    voice: "cocky",
    lines: [...ITALIAN, ...FRENCH],
  },
  {
    id: "hugo",
    name: "Hugo",
    avatar: "🦭",
    rating: 1150,
    brain: maia(1400, 0.8),
    resigns: "hopeless",
    voice: "zen",
    lines: [...QUEENS_GAMBIT, ...SLAV],
  },
  {
    id: "basil",
    name: "Basil",
    avatar: "🦡",
    rating: 1300,
    brain: maia(1500, 0.7),
    resigns: "hopeless",
    voice: "grumpy",
    lines: [...LONDON, ...CARO_KANN],
  },
  {
    id: "wanda",
    name: "Wanda",
    avatar: "🦢",
    rating: 1225,
    brain: maia(1600, 0.8),
    resigns: "hopeless",
    voice: "cocky",
    lines: [...KINGS_GAMBIT, ...DUTCH],
  },
  {
    id: "sasha",
    name: "Sasha",
    avatar: "🦉",
    rating: 1475,
    brain: maia(1600, 0.5),
    resigns: "hopeless",
    voice: "zen",
    lines: [...RUY_LOPEZ, ...FRENCH],
  },
  {
    id: "piotr",
    name: "Piotr",
    avatar: "🐗",
    rating: 1500,
    brain: maia(1700, 0.6),
    resigns: "hopeless",
    voice: "grumpy",
    lines: [...QUEENS_GAMBIT, ...KINGS_INDIAN],
  },
  {
    id: "rook",
    name: "Rook",
    avatar: "🐦‍⬛",
    rating: 1425,
    brain: maia(1800, 0.5),
    resigns: "hopeless",
    voice: "shy",
    lines: [...SCOTCH, ...OPEN_SICILIAN],
  },
  {
    id: "ida",
    name: "Ida",
    avatar: "🐝",
    rating: 1600,
    brain: maia(1900, 0.5),
    resigns: "hopeless",
    voice: "cheery",
    lines: [...ITALIAN, ...NAJDORF],
  },
  {
    id: "ezra",
    name: "Ezra",
    avatar: "🦈",
    rating: 1550,
    brain: maia(1900, 0.25),
    resigns: "hopeless",
    voice: "cocky",
    lines: [...RUY_LOPEZ, ...OPEN_SICILIAN],
  },
  // Past Rodent's 2800 ceiling: Stockfish with a stretched strength limit.
  {
    id: "fisher",
    name: "Fisher",
    avatar: "🐟",
    rating: 3200,
    brain: limited(2950, 1200),
    resigns: "early",
    voice: "cocky",
    lines: [...RUY_LOPEZ, ...NAJDORF],
  },
];


// Rodent IV personalities: styles and famous players, with their own opening books and taunts.
const RODENT_BOTS: Bot[] = [
  { id: "grumbles", name: "Grumbles", avatar: "😾", rating: 1450, brain: rodent("Grumpy", 850), resigns: "never", voice: "grumpy" },
  { id: "sacky", name: "Sacky", avatar: "🎲", rating: 1700, brain: rodent("Pawnsacker", 1150), resigns: "never", voice: "cheery" },
  { id: "swap", name: "Swap", avatar: "🔁", rating: 1850, brain: rodent("Swapper", 1325), resigns: "hopeless", voice: "zen" },
  { id: "blaze", name: "Blaze", avatar: "🔥", rating: 1675, brain: rodent("Spitfire", 1475), resigns: "hopeless", voice: "cocky" },
  { id: "bunker", name: "Bunker", avatar: "🛡️", rating: 1900, brain: rodent("Defender", 1625), resigns: "hopeless", voice: "shy" },
  { id: "boa", name: "Boa", avatar: "🪢", rating: 2025, brain: rodent("Strangler", 1775), resigns: "hopeless", voice: "zen" },
  { id: "morphy", name: "Morphy", avatar: "🎩", rating: 2100, brain: rodent("Morphy", 2025), resigns: "early", voice: "cheery" },
  { id: "nimzo", name: "Nimzowitsch", avatar: "🧐", rating: 2350, brain: rodent("Nimzowitsch", 2100), resigns: "early", voice: "grumpy" },
  { id: "petrosian", name: "Petrosian", avatar: "🧱", rating: 2475, brain: rodent("Petrosian", 2175), resigns: "early", voice: "zen" },
  { id: "tal", name: "Tal", avatar: "🪄", rating: 2425, brain: rodent("Tal", 2250), resigns: "early", voice: "cocky" },
  { id: "fischer", name: "Fischer", avatar: "♟️", rating: 2750, brain: rodent("Fischer", 2325, 800), resigns: "early", voice: "cocky" },
  { id: "spassky", name: "Spassky", avatar: "🐻", rating: 2725, brain: rodent("Spassky", 2400, 800), resigns: "early", voice: "zen" },
  { id: "karpov", name: "Karpov", avatar: "🐍", rating: 2800, brain: rodent("Karpov", 2500, 900), resigns: "early", voice: "shy" },
  { id: "kasparov", name: "Kasparov", avatar: "🌋", rating: 2825, brain: rodent("Kasparov", 2600, 900), resigns: "early", voice: "cocky" },
  { id: "topalov", name: "Topalov", avatar: "⚔️", rating: 2650, brain: rodent("Topalov", 2700, 1000), resigns: "early", voice: "grumpy" },
];

// Patricia hunts for sacrifices; the gyal nets play like tricky online humans.
const STYLE_BOTS: Bot[] = [
  { id: "tiny", name: "Tiny", avatar: "🌀", rating: 350, brain: gyal("tinygyal-8", 1), resigns: "never", voice: "cheery" },
  { id: "dagger", name: "Dagger", avatar: "🗡️", rating: 1625, brain: patricia(6), resigns: "never", voice: "cocky" },
  { id: "evil", name: "Evil", avatar: "😈", rating: 800, brain: gyal("evilgyal-6", 1, 0.8), resigns: "hopeless", voice: "cocky" },
  { id: "gambit", name: "Gambit", avatar: "🎰", rating: 2050, brain: patricia(13), resigns: "hopeless", voice: "cheery" },
  { id: "mean", name: "Mean Girl", avatar: "💅", rating: 2150, brain: gyal("meangirl-8", 100), resigns: "hopeless", voice: "cocky" },
  { id: "pyro", name: "Pyro", avatar: "🧨", rating: 2450, brain: patricia(16), resigns: "early", voice: "grumpy" },
  { id: "hustler", name: "Hustler", avatar: "🃏", rating: 2400, brain: gyal("evilgyal-6", 400), resigns: "early", voice: "zen" },
  { id: "badgyal", name: "Bad Gyal", avatar: "🖤", rating: 2600, brain: gyal("badgyal-8", 100), resigns: "early", voice: "grumpy" },
  { id: "patricia", name: "Patricia", avatar: "💣", rating: 2775, brain: patricia(18), resigns: "early", voice: "cocky" },
];

export const BOTS: Bot[] = [...LADDER, ...RODENT_BOTS, ...STYLE_BOTS].sort((a, b) => a.rating - b.rating);

// Which installed engine a bot needs.
export const engineFor = (bot: Bot) =>
  bot.brain.kind === "maia" || bot.brain.kind === "gyal" ? "lc0" : bot.brain.kind;

export const botById = (id: string) => BOTS.find((b) => b.id === id);

// A random playable bot within 200 of the rating, avoiding an immediate rematch.
export const findOpponent = (
  rating: number,
  excludeId?: string,
  rand = Math.random,
  playable: (bot: Bot) => boolean = () => true,
): Bot | undefined => {
  const candidates = BOTS.filter((b) => playable(b) && b.id !== excludeId);
  let pool = candidates.filter((b) => Math.abs(b.rating - rating) <= 200);
  if (pool.length === 0) {
    pool = [...candidates]
      .sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating))
      .slice(0, 2);
  }
  return pool[Math.floor(rand() * pool.length)];
};

export type Moment =
  "greet" | "check" | "capture" | "resign" | "win" | "lose" | "draw";

const LINES: Record<Voice, Record<Moment, string[]>> = {
  shy: {
    greet: ["oh, hi. good luck!", "um. ready when you are."],
    check: ["sorry, check.", "check... I think?"],
    capture: ["sorry about that piece.", "I hope you did not need that."],
    resign: ["I think you got me. good game."],
    win: ["oh! I won? good game."],
    lose: ["that was fun anyway. good game."],
    draw: ["a draw is nice. good game."],
  },
  cocky: {
    greet: [
      "hope you brought snacks, this will be quick.",
      "another challenger, how cute.",
    ],
    check: ["check. get used to it.", "check! sweating yet?"],
    capture: ["thanks for the free piece.", "yoink."],
    resign: ["fine. you got lucky this time."],
    win: ["too easy. next!"],
    lose: ["rematch. now."],
    draw: ["I was winning, you know."],
  },
  grumpy: {
    greet: ["let us get this over with.", "hmph. your move, eventually."],
    check: ["check. obviously.", "check."],
    capture: ["mine now.", "should have seen that coming."],
    resign: ["bah. take it."],
    win: ["as expected."],
    lose: ["the board was tilted."],
    draw: ["a waste of an afternoon."],
  },
  cheery: {
    greet: ["hi hi! let us have fun!", "yay, a game!"],
    check: ["check! wheee!", "check, check, check!"],
    capture: ["ooh, a snack!", "gotcha!"],
    resign: ["you crushed me! well played!"],
    win: ["woohoo! good game!"],
    lose: ["you are so good! again?"],
    draw: ["everybody wins!"],
  },
  zen: {
    greet: ["the board is quiet. begin.", "breathe. then move."],
    check: ["the king must move.", "check, gently."],
    capture: ["all pieces return to the box.", "a trade of energy."],
    resign: ["the position has spoken. I resign."],
    win: ["the game ends, as all things do."],
    lose: ["a lesson, gratefully received."],
    draw: ["balance."],
  },
};

export const quip = (bot: Bot, moment: Moment, rand = Math.random) => {
  const options = LINES[bot.voice][moment];
  return options[Math.floor(rand() * options.length)]!;
};
