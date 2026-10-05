# chessmod

Play rated chess against bots inside Claude Code while Claude works. The board sits just above the prompt while Claude is busy and steps aside when Claude needs you.

```
🪄 Tal 2250 · in his style      8  ♜  ♞  ♝  ♛  ♚  ♝     ♜
♙                               7  ♟  ♟  ♟     ♟  ♟  ♟  ♟
"Be more careful next time"     6                 ♞
                                5           ♟
                                4           ♙  ♙
♟                               3        ♘
You 262?                        2  ♙  ♙  ♙        ♙  ♙  ♙
Your move                       1  ♖     ♗  ♕  ♔  ♗  ♘  ♖
Resign                             a  b  c  d  e  f  g  h
> your prompt
```

## How it plays

- **No setup per game.** When the board opens, you are matched against a bot within 200 points of your rating and given a random color.
- **No clock.** Games pause whenever the board hides and pick up where they left off, even across sessions.
- **One option: resign.** Otherwise every game is played to the end and scored. Resign takes two clicks so a stray click doesn't cost you a game.
- **Moves:** in the terminal, click a piece then its target, or drag it. Legal targets are dotted and the last move is highlighted. Pawns promote to a queen.
- **Rating:** Elo, starting at 250 with a floor of 100. The first 10 games are provisional (shown with `?`) and swing harder.
- **Next game:** a new opponent arrives 4 seconds after a game ends.
- **Engine trouble never stalls a game.** If a bot's engine fails or sends a move that isn't legal, the bot plays a random legal move and a red line under the board says why.

## When the board shows

The board lives in the strip above the prompt, about 9 rows tall, so the transcript keeps its full width.

| Claude is... | The board |
| --- | --- |
| working on a turn | shows |
| showing a permission prompt | hides |
| asking you a question or a plan to approve | hides |
| still working after you answer | shows again |
| finished with the turn | hides |

`/chess` pins the board so it also shows while Claude is idle; `/chess` again unpins it. The strip's `[-]` mark collapses it.

In a narrow terminal (under about 50 columns) the side column drops away and a single status line sits under the board.

## The bots

There are 50 bots, from 100 to 3200. Each has a name, an avatar, an opening book, a resignation habit and a voice (shy, cocky, grumpy, cheery or zen) that comments on checks, captures and results.

| Rating | Engine | Character |
| --- | --- | --- |
| 100 to 775 | Maia 1100 plus random moves | Human instincts, frequent blunders. Most never resign. |
| 875 to 1600 | Maia 1100 to 1900 | Trained on real Lichess games at each rating, so they make human mistakes rather than engine ones. Each samples Maia's move probabilities at its own temperature. |
| 350 to 2600 | Leela style nets | Tiny, Evil, Mean Girl, Hustler and Bad Gyal: dkappe's nets trained on lichess games, tricky and trappy like online opponents. |
| 1450 to 2025 | Rodent IV styles | Grumbles (grumpy), Blaze (attacks), Sacky (throws pawns at you), Swap (trades everything), Bunker (defends), Boa (squeezes). |
| 1625 to 2775 | Patricia | Dagger, Gambit, Pyro and Patricia: an engine built to attack, which picks sound-looking sacrifices when weakened. |
| 2100 to 2825 | Rodent IV players | Morphy, Nimzowitsch, Tal, Petrosian, Topalov, Spassky, Fischer, Karpov and Kasparov, each with an opening book built from that player's games. |
| 3200 | Stockfish | Fisher, at Stockfish's strongest limited setting. |

[Maia](https://maiachess.com) is a set of neural networks that predict the move a human of a given rating would play. chessmod runs them through [lc0](https://lczero.org) with a single node per move, which takes about a quarter of a second.

[Rodent IV](https://github.com/nescitus/rodent-iv) is an engine whose evaluation is tuned by personality files: how much it values attack, material, pawn structure and so on. Its bots also taunt you ("Be more careful next time"), and half of those lines show up as the bot's chat. A Rodent move takes about 1.5 seconds.

[Patricia](https://github.com/Adam-Kulju/Patricia) is an aggressive engine. Its strength setting normally relies on state kept between moves, which chessmod's one-process-per-move design throws away, so setup builds it from a pinned commit with a small patch (`patches/patricia-stateless-skill.diff`) that makes the setting work per move.

The Maia roster and opening lines come from repertoire's "The Grind" mode.

### Ratings

Every bot's rating was measured, not guessed: 939 games between neighbouring bots and Stockfish anchors (Stockfish 19 limited to Elo 1320, 1600, 1900, 2200, 2500 and 2800 at 400ms per move), fitted with a Bradley-Terry model. So ratings are on Stockfish's limiter scale, not a human rating pool, and the human-trained Maia bots sit 200 to 400 below the Lichess ratings their networks are named after. Nothing anchors the ladder below about 1250, so the order of the weakest bots is reliable but the gaps between them are rough.

To re-measure after changing a bot, see `calibration/README.md` (one round of about 370 games takes about 40 minutes).

## Requirements

- Claude Code with mods (plugin hooks) support, in the terminal or the desktop app's Code tab
- macOS or Linux with `sh`, `grep`, `curl`, `tar` and `mktemp`
- For the Maia bots: [Homebrew](https://brew.sh), so setup can install lc0 (it has no official macOS or Linux download)
- For the Patricia bots: git, make and a C++ compiler (on macOS, `xcode-select --install`)
- For the Rodent bots: macOS. Rodent's only macOS build is for Intel, so Apple Silicon Macs run it through Rosetta (`softwareupdate --install-rosetta --agree-to-license`)

Whatever is missing only removes the bots that need it. Stockfish bots work everywhere.

Clicking the board needs Claude Code's fullscreen terminal layout, which is where the terminal reports mouse clicks. The desktop app can't send clicks to the board yet, so it shows a static board with a box for typing moves (`e4`, `Nf3`, `O-O`).

## Install

1. Clone this repo:

   ```sh
   git clone https://github.com/0xdiid/chessmod ~/Git/chessmod
   ```

2. Load it as a plugin, using one of these:

   - For one terminal session: `claude --plugin-dir ~/Git/chessmod`
   - For every session, including the desktop app: add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`:

     ```json
     { "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/Git/chessmod" } }
     ```

3. Start a task in Claude Code. A setup screen appears above the prompt; click **Set up**. It downloads about 160MB the first time:

   | Piece | Source | Size |
   | --- | --- | --- |
   | Stockfish | Official GitHub release, skipped if `stockfish` is on your `PATH` | about 80MB |
   | lc0 | `brew install lc0`, skipped if already installed | |
   | Maia networks | CSSLab's GitHub | about 12MB |
   | Rodent and its books | Rodent's GitHub (macOS only) | about 25MB |
   | Leela style nets | dkappe's GitHub | about 9MB |
   | Patricia | Built from its GitHub source at a pinned commit, with chessmod's patch | about 30MB fetched, 15 seconds |

   `/chess setup` does the same from the prompt.

## Commands

| Command | Does |
| --- | --- |
| `/chess` | Pins the board above the prompt, or unpins it. Works while Claude is mid-turn. |
| `/chess setup` | Downloads or installs whatever is missing, and reports anything it couldn't do. |

## Files and data

| Path | Holds |
| --- | --- |
| `~/.chessmod/bin/` | Downloaded Stockfish and Rodent, built Patricia |
| `~/.chessmod/weights/` | The Maia and Leela style networks |
| `~/.chessmod/rodent-books/` | Rodent's opening books |
| `~/.claude/plugins/store/chessmod_*.json` | Your rating, your last 200 games and the game in progress. Delete it to start the ladder over. |

Deleting `~/.chessmod` removes everything setup downloaded (lc0 stays installed through Homebrew).

`scripts/uci-once.sh` exists because a mod can't hold a long-running conversation with an engine. Each bot move runs the engine once, and engines quit as soon as their input ends, often mid-search. The wrapper keeps the engine's input open until it prints `bestmove`.

## Project layout

```
.claude-plugin/plugin.json   plugin manifest
hooks/hooks.json             points at register.tsx
hooks/register.tsx           commands, turn tracking, setup, game loop, the band above the prompt
hooks/board.tsx              the clickable board (a Client surface module)
hooks/bots.ts                the roster, opening books, matchmaking, chat lines
hooks/brain.ts               how a bot picks a move: resign, book, random, engine
hooks/engine.ts              engine paths, Maia policy sampling, Rodent taunts
hooks/rating.ts              Elo
hooks/chess.js               chess.js 1.4.0, vendored (mods can't import npm packages)
rodent/personalities/        Rodent IV personality files (GPL-3.0, see rodent/LICENSE)
scripts/uci-once.sh          runs an engine for one move
scripts/build-patricia.sh    builds Patricia with the patch below
patches/                     chessmod's patch to Patricia
calibration/                 the self-play harness that measured the bot ratings
types/index.d.ts             the plugin's state contract
tsconfig.json                extends the types Claude Code generates
```

## Development

Run the checks from the repo root:

```sh
claude plugin validate .
claude plugin test .
```

`claude plugin test` runs `hooks/logic.test.ts` (ratings, bots, engines) and `hooks/band.test.tsx` (when the board shows, setup, play) against Claude Code's own engine. The engines, file system and store are stubbed, so tests don't need Stockfish or lc0.

To typecheck, load the mod once so Claude Code writes `.claude-plugin/types/` (gitignored), then run `npx tsc -p .`.

In a session with mod hot reloading on, saving a file reloads the mod once the folder is quiet, so changes show up without a restart.

## Credits

- [chess.js](https://github.com/jhlywa/chess.js) (BSD 2-Clause) for move generation and rules, vendored in `hooks/chess.js`
- [Maia Chess](https://github.com/CSSLab/maia-chess) by the University of Toronto CSSLab for the human-like networks, downloaded at setup and not bundled
- [Rodent IV](https://github.com/nescitus/rodent-iv) by Pawel Koziol (GPL-3.0): personality files bundled in `rodent/`, engine and books downloaded at setup
- [Patricia](https://github.com/Adam-Kulju/Patricia) by Adam Kulju (MIT), built at setup with chessmod's patch
- [dkappe's Leela nets](https://github.com/dkappe/leela-chess-weights) (Tiny Gyal, Evil Gyal, Mean Girl, Bad Gyal). They carry no license, so setup downloads them from their author's own URLs and this repo doesn't redistribute them.
- [lc0](https://github.com/LeelaChessZero/lc0) and [Stockfish](https://github.com/official-stockfish/Stockfish), installed or downloaded at setup

## License

chessmod's own code is MIT (see `LICENSE`). Bundled third-party files keep their licenses: `hooks/chess.js` is BSD 2-Clause (`hooks/chess.LICENSE`) and `rodent/personalities/` is GPL-3.0 (`rodent/LICENSE`). The engines, networks and books setup downloads are not part of this repo and carry their own licenses.
