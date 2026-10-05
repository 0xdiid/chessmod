import type { ClientModule } from 'claude-code'

// Columns and rows per square: 3x1 keeps the band short, 5x2 looks square and is easier to click.
export type SquareSize = { w: number; h: number }
export const COMPACT: SquareSize = { w: 3, h: 1 }
export const LARGE: SquareSize = { w: 5, h: 2 }

export type BoardProps = {
  // 64 entries, a8 first: 'wP', 'bK', or '' for empty.
  squares: string[]
  // Legal targets by origin square, e.g. { e2: ['e3', 'e4'] }; empty while locked.
  legal: Record<string, string[]>
  lastMove: string[]
  // Draw from black's side.
  flip: boolean
  size: SquareSize
}

type Local = { selected?: string; listening?: true }

export const GLYPHS: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const LIGHT = '#f0d9b5'
const DARK = '#b58863'
const FILES = 'abcdefgh'
// The rank label's columns left of the squares.
const LABEL = 2

export const boardColumns = (size: SquareSize) => LABEL + 8 * size.w
export const boardRows = (size: SquareSize) => 8 * size.h + 1

// Display row/column to square name, honoring the flip.
const nameAt = (r: number, c: number, flip: boolean) => (flip ? `${FILES[7 - c]}${r + 1}` : `${FILES[c]}${8 - r}`)

type Make = (props: Record<string, unknown>) => unknown

// Draws the board with whichever surface's Box and Text are handed in.
export const drawBoard = (Box: Make, Text: Make, props: BoardProps, selected?: string) => {
  const { w, h } = props.size
  const targets = new Set(selected ? props.legal[selected] : [])
  const last = new Set(props.lastMove)
  const glyphRow = Math.floor((h - 1) / 2)
  const pad = ' '.repeat(Math.floor((w - 1) / 2))
  const blank = ' '.repeat(w)

  const lines = []
  for (let r = 0; r < 8; r++) {
    for (let line = 0; line < h; line++) {
      const label = line === glyphRow ? `${props.flip ? r + 1 : 8 - r} ` : '  '
      const cells = [Text({ dimColor: true, children: label })]
      for (let c = 0; c < 8; c++) {
        const name = nameAt(r, c, props.flip)
        const piece = props.squares[(8 - Number(name[1])) * 8 + FILES.indexOf(name[0]!)] ?? ''
        const light = (r + c) % 2 === 0
        let bg = light ? LIGHT : DARK
        if (last.has(name)) bg = light ? '#cdd26a' : '#aaa23a'
        if (name === selected) bg = '#7fa650'
        const glyph = piece ? GLYPHS[piece[1]!.toLowerCase()] : targets.has(name) ? '•' : ' '
        cells.push(
          Text({
            backgroundColor: bg,
            color: piece ? (piece[0] === 'w' ? '#ffffff' : '#000000') : '#3d5a2a',
            bold: true,
            children: line === glyphRow ? `${pad}${glyph}${' '.repeat(w - pad.length - 1)}` : blank,
          }),
        )
      }
      lines.push(Box({ flexDirection: 'row', children: cells }))
    }
  }
  const files = (props.flip ? 'hgfedcba' : FILES).split('')
  lines.push(Text({ dimColor: true, children: ' '.repeat(LABEL) + files.map(f => `${pad}${f}`.padEnd(w)).join('') }))
  return Box({ flexDirection: 'column', children: lines })
}

// The pointer listener is set once, so it reads the newest props from here.
let latest: BoardProps = { squares: [], legal: {}, lastMove: [], flip: false, size: COMPACT }

const squareAt = (x: number, y: number) => {
  const { w, h } = latest.size
  const c = Math.floor((x - LABEL) / w)
  const r = Math.floor(y / h)
  if (x < LABEL || c > 7 || y < 0 || r > 7) return undefined
  return nameAt(r, c, latest.flip)
}

const Board: ClientModule<BoardProps, Local> = (props, surface) => {
  latest = props
  const { Box, Text } = surface.elements
  const local = surface.state ?? {}

  if (!local.listening) {
    let dragFrom: string | undefined
    surface.onPointer(e => {
      const current = surface.state ?? {}
      const sq = squareAt(e.x, e.y)
      if (e.type === 'down' && e.button === 'left') {
        if (current.selected && sq && latest.legal[current.selected]?.includes(sq)) {
          surface.post({ from: current.selected, to: sq })
          surface.setState({ ...current, selected: undefined })
          return
        }
        dragFrom = sq && latest.legal[sq] ? sq : undefined
        surface.setState({ ...current, selected: dragFrom })
      }
      if (e.type === 'up' && dragFrom && sq && sq !== dragFrom && latest.legal[dragFrom]?.includes(sq)) {
        surface.post({ from: dragFrom, to: sq })
        surface.setState({ ...current, selected: undefined })
      }
      if (e.type === 'up') dragFrom = undefined
    })
    surface.setState({ ...local, listening: true })
  }

  const selected = local.selected && props.legal[local.selected] ? local.selected : undefined
  return drawBoard(Box as Make, Text as Make, props, selected) as ReturnType<typeof Box>
}

export default Board
