import type { GameRecord, Ladder, Result } from '../types'

export const START_RATING = 250;
export const RATING_FLOOR = 100;
export const PROVISIONAL_GAMES = 10;

export const freshLadder = (): Ladder => ({
  rating: START_RATING,
  peak: START_RATING,
  games: [],
});

export const expectedScore = (player: number, opponent: number) =>
  1 / (1 + Math.pow(10, (opponent - player) / 400));

export const kFactor = (gamesPlayed: number) =>
  gamesPlayed < PROVISIONAL_GAMES ? 40 : gamesPlayed < 30 ? 24 : 16;

export const ratingDelta = (
  player: number,
  opponent: number,
  gamesPlayed: number,
  result: Result,
) => {
  const score = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
  return Math.round(
    kFactor(gamesPlayed) * (score - expectedScore(player, opponent)),
  );
};

export const recordGame = (
  ladder: Ladder,
  game: Omit<GameRecord, "delta" | "rating" | "at">,
  at: string,
): { ladder: Ladder; record: GameRecord } => {
  const delta = ratingDelta(
    ladder.rating,
    game.botRating,
    ladder.games.length,
    game.result,
  );
  const rating = Math.max(RATING_FLOOR, ladder.rating + delta);
  const record: GameRecord = {
    ...game,
    delta: rating - ladder.rating,
    rating,
    at,
  };
  return {
    ladder: {
      rating,
      peak: Math.max(ladder.peak, rating),
      games: [...ladder.games, record].slice(-200),
    },
    record,
  };
};

export const tally = (ladder: Ladder) => {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const g of ladder.games) {
    if (g.result === "win") wins++;
    else if (g.result === "draw") draws++;
    else losses++;
  }
  return { wins, draws, losses };
};

export const ratingLabel = (ladder: Ladder) =>
  `${ladder.rating}${ladder.games.length < PROVISIONAL_GAMES ? "?" : ""}`;
