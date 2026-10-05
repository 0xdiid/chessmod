export type Result = 'win' | 'loss' | 'draw'

export type GameRecord = {
  botId: string
  botRating: number
  color: 'w' | 'b'
  result: Result
  delta: number
  rating: number
  plies: number
  at: string
}

export type Ladder = { rating: number; peak: number; games: GameRecord[] }

export type SavedGame = {
  botId: string
  color: 'w' | 'b'
  // SAN, from the start position.
  moves: string[]
  chat: string
  result?: Result
  reason?: string
  delta?: number
}

export type Setup = {
  platform: 'mac-arm' | 'mac-intel' | 'linux-x64' | 'linux-arm' | 'other'
  // What runs each engine, absent when it is not installed.
  engines: Partial<Record<'stockfish' | 'lc0' | 'rodent' | 'patricia', string[]>>
  // Whether Intel macOS binaries can run (Rodent).
  rosetta: boolean
  brew: boolean
  // git, make and a C++ compiler, to build Patricia.
  toolchain: boolean
  missingNets: number[]
  missingStyleNets: string[]
  missingBooks: string[]
}

declare module 'claude-code' {
  interface PluginState {
    chessmod: {
      ladder: Ladder
      game: SavedGame | null
      busy: boolean
      note: string
      setup: Setup | null
      installing: string | null
      setupDone: boolean
      resignArmed: boolean
      paused: boolean
      pinned: boolean
    }
  }
}
