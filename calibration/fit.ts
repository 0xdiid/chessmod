// Fits Elo ratings to games.jsonl by maximum likelihood with the Stockfish anchors held fixed.
//   npx tsx fit.ts [--fix sf1320,sf1600,...] [--prior 400] [--out ratings.json]
// --fix chooses which anchors are pinned at their UCI_Elo (default: all). Unpinned anchors are
// fitted like bots, which shows how self-consistent Stockfish's limiter is at our move time.
// --prior is the sd (Elo) of a weak Gaussian pull toward each bot's label, so a 100% score
// stays finite; with a few games against near neighbours it moves estimates very little.
import { readFileSync, writeFileSync } from "node:fs";
import { BOTS } from "../hooks/bots";
import { ANCHORS, type GameResult } from "./play";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const IN = new URL("./games.jsonl", import.meta.url).pathname;
const OUT = arg("out", new URL("./ratings.json", import.meta.url).pathname);
const PRIOR_SD = Number(arg("prior", "400"));
const fixIds = new Set(
  arg("fix", ANCHORS.map((a) => a.id).join(",")).split(","),
);

const games = readFileSync(IN, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as GameResult);

const players = [...BOTS, ...ANCHORS];
const label = new Map(players.map((p) => [p.id, p.rating]));
const ids = players
  .map((p) => p.id)
  .filter((id) => games.some((g) => g.white === id || g.black === id));
const free = ids.filter((id) => !fixIds.has(id));
const idx = new Map(free.map((id, i) => [id, i]));
const r = new Map(ids.map((id) => [id, label.get(id)!]));

const C = Math.log(10) / 400;
const expected = (a: number, b: number) =>
  1 / (1 + Math.pow(10, (b - a) / 400));

// Newton's method on the log-likelihood.
let H: number[][] = [];
for (let iter = 0; iter < 100; iter++) {
  const n = free.length;
  const g = new Array(n).fill(0);
  H = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const id of free) {
    const i = idx.get(id)!;
    g[i] -= (r.get(id)! - label.get(id)!) / PRIOR_SD ** 2;
    H[i]![i]! -= 1 / PRIOR_SD ** 2;
  }
  for (const game of games) {
    const e = expected(r.get(game.white)!, r.get(game.black)!);
    const w = C * C * e * (1 - e);
    const resid = C * (game.score - e);
    const iw = idx.get(game.white);
    const ib = idx.get(game.black);
    if (iw !== undefined) ((g[iw] += resid), (H[iw]![iw]! -= w));
    if (ib !== undefined) ((g[ib] -= resid), (H[ib]![ib]! -= w));
    if (iw !== undefined && ib !== undefined)
      ((H[iw]![ib]! += w), (H[ib]![iw]! += w));
  }
  const step = solve(
    H.map((row) => row.map((v) => -v)),
    g,
  );
  let moved = 0;
  for (const id of free) {
    const s = Math.max(-300, Math.min(300, step[idx.get(id)!]!));
    r.set(id, r.get(id)! + s);
    moved = Math.max(moved, Math.abs(s));
  }
  if (moved < 0.01) break;
}

// Standard errors from the inverse of the observed information.
const cov = invert(H.map((row) => row.map((v) => -v)));

const rows = ids
  .map((id) => {
    const mine = games.filter((g) => g.white === id || g.black === id);
    const pts = mine.reduce(
      (s, g) => s + (g.white === id ? g.score : 1 - g.score),
      0,
    );
    const opp =
      mine.reduce((s, g) => s + r.get(g.white === id ? g.black : g.white)!, 0) /
      mine.length;
    const i = idx.get(id);
    return {
      id,
      label: label.get(id)!,
      est: Math.round(r.get(id)!),
      se: i === undefined ? 0 : Math.round(Math.sqrt(cov[i]![i]!)),
      games: mine.length,
      score: pts / mine.length,
      opp: Math.round(opp),
      fixed: fixIds.has(id),
    };
  })
  .sort((a, b) => a.est - b.est);

console.log(
  `${games.length} games; fixed: ${[...fixIds].filter((f) => ids.includes(f)).join(", ")}; prior sd ${PRIOR_SD}`,
);
console.log("id          label   est    ±se  games  score  avgOpp  diff");
for (const x of rows)
  console.log(
    `${x.id.padEnd(11)} ${String(x.label).padStart(5)} ${String(x.est).padStart(5)}${x.fixed ? "*" : " "} ${String(x.se).padStart(5)} ${String(x.games).padStart(6)} ${(x.score * 100).toFixed(0).padStart(5)}% ${String(x.opp).padStart(7)} ${String(x.est - x.label).padStart(5)}`,
  );
const reasons: Record<string, number> = {};
for (const g of games) reasons[g.reason] = (reasons[g.reason] ?? 0) + 1;
const problems = games.reduce((s, g) => s + g.problems, 0);
console.log(
  `end reasons: ${JSON.stringify(reasons)}; engine fallbacks: ${problems}`,
);

if (!process.argv.includes("--no-write"))
  writeFileSync(
    OUT,
    JSON.stringify(Object.fromEntries(rows.map((x) => [x.id, x.est])), null, 1),
  );

function solve(A: number[][], b: number[]) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++)
      if (Math.abs(M[i]![c]!) > Math.abs(M[p]![c]!)) p = i;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const f = M[i]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[i]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

function invert(A: number[][]) {
  const n = A.length;
  return Array.from({ length: n }, (_, j) =>
    solve(
      A,
      A.map((_, i) => (i === j ? 1 : 0)),
    ),
  ).reduce<number[][]>((cols, col, j) => {
    col.forEach((v, i) => ((cols[i] ??= [])[j] = v));
    return cols;
  }, []);
}
