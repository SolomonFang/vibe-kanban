const GLYPHS = {
  H: [
    '11000011',
    '11000011',
    '11111111',
    '11111111',
    '11000011',
    '11000011',
  ],
  E: [
    '11111111',
    '11000000',
    '11111110',
    '11111110',
    '11000000',
    '11111111',
  ],
  L: [
    '11000000',
    '11000000',
    '11000000',
    '11000000',
    '11000000',
    '11111111',
  ],
  I: [
    '11111111',
    '00111100',
    '00111100',
    '00111100',
    '00111100',
    '11111111',
  ],
  O: [
    '01111110',
    '11000011',
    '11000011',
    '11000011',
    '11000011',
    '01111110',
  ],
  S: [
    '01111111',
    '11000000',
    '01111110',
    '00000011',
    '00000011',
    '11111110',
  ],
  K: [
    '11000011',
    '11000110',
    '11111100',
    '11111100',
    '11000110',
    '11000011',
  ],
  A: [
    '01111110',
    '11000011',
    '11111111',
    '11111111',
    '11000011',
    '11000011',
  ],
  N: [
    '11000011',
    '11100011',
    '11110011',
    '11011011',
    '11001111',
    '11000011',
  ],
  B: [
    '11111110',
    '11000011',
    '11111110',
    '11111110',
    '11000011',
    '11111110',
  ],
  '-': [
    '00000000',
    '00000000',
    '00111100',
    '00111100',
    '00000000',
    '00000000',
  ],
} as const;

const WORDMARK = 'HELIOS-KANBAN';
const CELL_WIDTH = 7.201;
const CELL_HEIGHT = 13.594;
const GLYPH_COLUMNS = 8;
const GLYPH_ROWS = 6;
const LETTER_GAP = CELL_WIDTH;
const GLYPH_WIDTH = GLYPH_COLUMNS * CELL_WIDTH;
const GLYPH_HEIGHT = GLYPH_ROWS * CELL_HEIGHT;
const SHADOW_DX = 6;
const SHADOW_DY = 6;
const VIEW_BOX_WIDTH =
  WORDMARK.length * GLYPH_WIDTH +
  (WORDMARK.length - 1) * LETTER_GAP +
  SHADOW_DX;
const VIEW_BOX_HEIGHT = GLYPH_HEIGHT + SHADOW_DY;

function buildPath(): string {
  const segments: string[] = [];

  WORDMARK.split('').forEach((char, letterIndex) => {
    const glyph = GLYPHS[char as keyof typeof GLYPHS];
    const offsetX = letterIndex * (GLYPH_WIDTH + LETTER_GAP);

    glyph.forEach((row, rowIndex) => {
      const y = rowIndex * CELL_HEIGHT;
      let runStart: number | null = null;

      const flushRun = (endColumn: number) => {
        if (runStart === null) return;
        const x = offsetX + runStart * CELL_WIDTH;
        const w = (endColumn - runStart) * CELL_WIDTH;
        segments.push(`M${x} ${y + CELL_HEIGHT}V${y}H${x + w}V${y + CELL_HEIGHT}Z`);
        runStart = null;
      };

      for (let col = 0; col < row.length; col += 1) {
        if (row[col] === '1') {
          if (runStart === null) runStart = col;
        } else {
          flushRun(col);
        }
      }
      flushRun(row.length);
    });
  });

  return segments.join('');
}

export function Logo() {
  const pathData = buildPath();

  return (
    <svg
      width="220"
      viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
      className="logo"
      role="img"
      aria-label="HELIOS-KANBAN"
      shapeRendering="crispEdges"
    >
      {/* bottom-right shadow layer */}
      <path
        d={pathData}
        fill="#1a1a1a"
        transform={`translate(${SHADOW_DX},${SHADOW_DY})`}
      />
      {/* main letter layer */}
      <path d={pathData} fill="currentColor" />
    </svg>
  );
}
