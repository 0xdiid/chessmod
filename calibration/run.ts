// Schedules and plays calibration games, appending each result to games.jsonl.
//   npx tsx run.ts [--games 6] [--neighbors 2] [--concurrency 12] [--ratings ratings.json] [--dry]
// Players are sorted by current estimate (ratings.json from fit.ts if given, else labels);
// each plays its next `neighbors` players until every such pair has `games` games.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { BOTS, type Bot } from "../hooks/bots";
import { ANCHORS, playGame, type GameResult } from "./play";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const GAMES = Number(arg("games", "6"));
const NEIGHBORS = Number(arg("neighbors", "2"));
const CONCURRENCY = Number(arg("concurrency", "12"));
const RATINGS = arg("ratings", "");
const OUT = new URL("./games.jsonl", import.meta.url).pathname;
const DRY = process.argv.includes("--dry");
// Only schedule pairs that include one of these ids (e.g. newly added bots).
const ONLY = new Set(arg("only", "").split(",").filter(Boolean));

const players: Bot[] = [...BOTS, ...ANCHORS];

const estimate: Record<string, number> =
  RATINGS && existsSync(RATINGS)
    ? JSON.parse(readFileSync(RATINGS, "utf8"))
    : {};
const order = [...players].sort(
  (a, b) => (estimate[a.id] ?? a.rating) - (estimate[b.id] ?? b.rating),
);

const played = existsSync(OUT)
  ? readFileSync(OUT, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as GameResult)
  : [];
const key = (a: string, b: string) => [a, b].sort().join("|");
const count = new Map<string, number>();
const whiteCount = new Map<string, number>();
for (const g of played) {
  count.set(key(g.white, g.black), (count.get(key(g.white, g.black)) ?? 0) + 1);
  whiteCount.set(
    `${g.white}>${g.black}`,
    (whiteCount.get(`${g.white}>${g.black}`) ?? 0) + 1,
  );
}

type Job = { white: Bot; black: Bot };
const jobs: Job[][] = [];
for (let i = 0; i < order.length; i++)
  for (let j = i + 1; j <= i + NEIGHBORS && j < order.length; j++) {
    const a = order[i]!;
    const b = order[j]!;
    if (ONLY.size && !ONLY.has(a.id) && !ONLY.has(b.id)) continue;
    const need = GAMES - (count.get(key(a.id, b.id)) ?? 0);
    const pairJobs: Job[] = [];
    let aw = whiteCount.get(`${a.id}>${b.id}`) ?? 0;
    let bw = whiteCount.get(`${b.id}>${a.id}`) ?? 0;
    for (let k = 0; k < need; k++) {
      if (aw <= bw) (pairJobs.push({ white: a, black: b }), aw++);
      else (pairJobs.push({ white: b, black: a }), bw++);
    }
    if (pairJobs.length) jobs.push(pairJobs);
  }

// Round-robin across pairs so a slow pair does not finish last on its own.
const queue: Job[] = [];
for (let k = 0; jobs.some((p) => p.length > k); k++)
  for (const p of jobs) if (p[k]) queue.push(p[k]!);

console.log(
  `${queue.length} games over ${jobs.length} pairs, ${CONCURRENCY} at a time`,
);
if (DRY) {
  for (const p of jobs)
    console.log(`  ${p[0]!.white.id} vs ${p[0]!.black.id}: ${p.length}`);
  process.exit(0);
}

const started = Date.now();
let done = 0;
const worker = async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const r = await playGame(job.white, job.black);
    appendFileSync(
      OUT,
      JSON.stringify({ ...r, at: new Date().toISOString() }) + "\n",
    );
    done++;
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    console.log(
      `[${done}/${done + queue.length}] ${mins}m ${r.white} ${r.score === 1 ? "1-0" : r.score === 0 ? "0-1" : "½-½"} ${r.black} (${r.reason}, ${r.plies} plies, ${(r.ms / 1000).toFixed(0)}s${r.problems ? `, ${r.problems} engine problems` : ""})`,
    );
  }
};
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
