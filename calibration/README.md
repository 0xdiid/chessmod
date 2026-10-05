# Rating calibration

Plays the real bots (`hooks/bots.ts` BOTS, moves from `hooks/brain.ts` `decide()`) against each
other and against Stockfish anchors, then fits Elo ratings by maximum likelihood.

## Requirements

Node 22, `npx tsx`, lc0 and stockfish at `/opt/homebrew/bin`, Rodent IV and the Maia nets under
`~/.chessmod` (same install the mod uses).

## Run

```sh
cd calibration
# Round 1: every player vs its 2 nearest neighbours by label, 4 games per pair (~370 games).
npx tsx run.ts --games 4 --neighbors 2 --concurrency 12 | tee round1.log
npx tsx fit.ts                       # writes ratings.json
# Round 2: re-sort by fitted estimate; plays the new neighbour pairs this creates (~250 games).
npx tsx run.ts --games 4 --neighbors 2 --ratings ratings.json | tee round2.log
npx tsx fit.ts
# Newly added bots: only pairs that include them, then once more after re-sorting.
npx tsx run.ts --games 4 --neighbors 3 --ratings ratings.json --only tiny,dagger,...
npx tsx fit.ts && npx tsx run.ts --games 4 --neighbors 2 --ratings ratings.json --only tiny,dagger,...
npx tsx fit.ts
```

Don't wait on the runner with `pgrep -f "tsx run.ts"`: it matches the waiting shell's own command line.

`run.ts --dry` prints the schedule without playing. Results append to `games.jsonl` one line per
game, so a run can be interrupted and resumed; pairs already at the target count are skipped.

`fit.ts` options: `--fix sf1320,sf1600` picks which anchors are pinned (default: all six),
`--prior 400` is the sd of a weak pull toward each bot's label (keeps 100% scores finite),
`--no-write` skips writing `ratings.json`.

## Design

- Anchors: Stockfish 19 `UCI_LimitStrength` at UCI_Elo 1320/1600/1900/2200/2500/2800, 400 ms per
  move, no book. Stockfish's limiter is calibrated against CCRL-ish engine ratings at longer time
  controls, so the scale is "Stockfish UCI_Elo at 400 ms", not a human pool. Nothing anchors
  below 1320; the basement is placed by its chain of games up through the pure Maia bots.
- Games: alternating colours, bots use their own books/temps/wildPct/resign rules exactly as in
  the mod. Draws by mate/stalemate/insufficient material/threefold/fifty-move rules.
- Adjudication: after ply 60 a material lead of 9+ held for 12 plies wins; at 240 plies a lead of
  4+ wins, otherwise draw.
- Fit: Bradley-Terry on the Elo logistic, Newton's method, SEs from the inverse information matrix
  (relative to the pinned anchors).

## Cost

On a 14-core M-series Mac at concurrency 12: roughly 8-10 games/minute (Maia games ~20-40 s,
Rodent/Stockfish games 60-150 s). Round 1 (372 games) took 37 min, round 2 (252) 24 min, the new-bot rounds (200 + 114) ~25 min.
