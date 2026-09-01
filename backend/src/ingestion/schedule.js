import { openPdf, extractRuns } from './pdfText.js'

// the first schedule classifies offences of the Bharatiya Nyaya Sanhita, so a row
// here is a BNS section even though it is printed in the BNSS gazette
export const ACT = 'Bharatiya Nyaya Sanhita, 2023'
export const ACT_SHORT = 'BNS'
export const SCHEDULE_PAGES = { from: 158, to: 189 }

const HEADER_Y = 760
const FOOTER_Y = 55
const LINE_TOLERANCE = 2.5
const MAX_CHARS = 1800

// six columns, listed by where each one starts on the page
const COLUMNS = [
  { key: 'section', from: 0, label: null },
  { key: 'offence', from: 88, label: 'Offence' },
  { key: 'punishment', from: 192, label: 'Punishment' },
  { key: 'cognizable', from: 285, label: 'Cognizable or non-cognizable' },
  { key: 'bailable', from: 369, label: 'Bailable or non-bailable' },
  { key: 'court', from: 447, label: 'By what Court triable' },
]

const SECTION_NUMBER = /^(\d{1,3})([A-Z])?((?:\([0-9a-z]{1,2}\))*)$/
// part II classifies offences under other acts and has its own columns
const PART_TWO = /^II\.\s*[—–-]/
const RULE = /^_{5,}$/

function columnAt(x) {
  let found = COLUMNS[0]
  for (const col of COLUMNS) if (x >= col.from - 2) found = col
  return found
}

// a whole table row sometimes comes back as one run spanning two columns, so cut
// it where the next column starts. the character width on these pages is even
// enough that the guess only has to land near a space.
function splitAtColumns(run, charWidth) {
  const out = []
  let rest = run
  for (;;) {
    const end = rest.x + rest.width
    // columns sit flush against each other and a real spill carries a whole
    // line of the next one, so a few points past the edge is just a wide word
    const edge = COLUMNS.find((c) => c.from > rest.x + 2 && c.from < end - charWidth * 5)
    if (!edge) break
    // the head stops short of the edge and the tail starts just after it, so
    // measuring from both sides and meeting in the middle beats either alone
    const fromHead = (edge.from - rest.x) / charWidth
    const fromTail = rest.str.length - (end - edge.from) / charWidth
    const at = nearestSpace(rest.str, Math.round((fromHead + fromTail) / 2))
    if (at <= 0) break
    out.push({ ...rest, str: rest.str.slice(0, at).trim(), width: edge.from - rest.x })
    rest = {
      ...rest,
      x: edge.from,
      str: rest.str.slice(at + 1).trim(),
      width: rest.x + rest.width - edge.from,
    }
    if (!rest.str) return out
  }
  out.push(rest)
  return out
}

function nearestSpace(text, guess) {
  let best = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ') continue
    if (best === -1 || Math.abs(i - guess) < Math.abs(best - guess)) best = i
  }
  return best
}

// runs that sit inside one column tell us how wide a character is here
function charWidthOf(runs) {
  const widths = runs
    .filter(
      (r) => r.str.length >= 10 && !COLUMNS.some((c) => c.from > r.x + 2 && c.from < r.x + r.width)
    )
    .map((r) => r.width / r.str.length)
    .sort((a, b) => a - b)
  return widths.length ? widths[Math.floor(widths.length / 2)] : 3.4
}

function toLines(runs) {
  const lines = []
  for (const run of runs.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - run.y) <= LINE_TOLERANCE)
    if (line) line.runs.push(run)
    else lines.push({ y: run.y, runs: [run] })
  }
  return lines.map((l) => ({ y: l.y, runs: l.runs.sort((a, b) => a.x - b.x) }))
}

const isColumnNumbers = (line) =>
  line.runs.length >= 4 && line.runs.every((r) => /^[1-6]$/.test(r.str.trim()))

// the table proper starts under the row of column numbers and ends at part II,
// which has its own numbering row and would otherwise look like a fresh start
function tableLines(lines) {
  const end = lines.findIndex((l) =>
    PART_TWO.test(
      l.runs
        .map((r) => r.str)
        .join(' ')
        .trim()
    )
  )
  const body = end === -1 ? lines : lines.slice(0, end)
  let start = 0
  for (const [i, line] of body.entries()) if (isColumnNumbers(line)) start = i + 1
  return body.slice(start)
}

function toCells(line) {
  const cells = {}
  for (const run of line.runs) {
    const key = columnAt(run.x).key
    cells[key] = cells[key] ? `${cells[key]} ${run.str}` : run.str
  }
  return cells
}

export function rowsFromPage(runs, pageNumber) {
  const inside = runs.filter((r) => r.y < HEADER_Y && r.y > FOOTER_Y && !RULE.test(r.str.trim()))
  const charWidth = charWidthOf(inside)
  const split = inside.flatMap((r) => splitAtColumns(r, charWidth)).filter((r) => r.str)

  return tableLines(toLines(split)).map((line) => ({
    page: pageNumber,
    cells: toCells(line),
  }))
}

// one entry per section, carrying every row printed against it
export function collectEntries(rows) {
  const entries = []
  let current = null

  for (const row of rows) {
    const label = repair(row)
    const number = SECTION_NUMBER.exec(label)
    if (number) {
      current = {
        number: number[1] + (number[2] || ''),
        subsection: number[3] || null,
        pageStart: row.page,
        pageEnd: row.page,
        rows: [],
      }
      entries.push(current)
    }
    if (!current) continue

    // a row with no text in any column is the gap between two entries
    const filled = COLUMNS.filter((c) => c.label && row.cells[c.key])
    if (!filled.length) continue

    const last = current.rows[current.rows.length - 1]
    const continuation = last && !number && !row.cells.section
    if (continuation && wrapsOnto(last, row)) appendTo(last, row)
    else current.rows.push(cellsOf(row))
    current.pageEnd = row.page
  }

  return entries.filter((e) => e.rows.length)
}

// "111(2)(a" with the bracket left in the next column, close it back up
function repair(row) {
  const label = (row.cells.section || '').replace(/\s+/g, '')
  const opens = (label.match(/\(/g) || []).length - (label.match(/\)/g) || []).length
  if (opens !== 1 || !row.cells.offence?.startsWith(')')) return label
  row.cells.offence = row.cells.offence.slice(1).trim()
  return label + ')'
}

// a wrapped line carries on the columns already open, a new row opens the
// offence column again
const wrapsOnto = (last, row) => !(row.cells.offence && last.offence && /[.;]$/.test(last.offence))

function cellsOf(row) {
  const out = {}
  for (const col of COLUMNS) if (col.label) out[col.key] = row.cells[col.key] || ''
  return out
}

function appendTo(last, row) {
  for (const col of COLUMNS) {
    if (!col.label || !row.cells[col.key]) continue
    last[col.key] = last[col.key] ? `${last[col.key]} ${row.cells[col.key]}` : row.cells[col.key]
  }
}

function renderRow(cells) {
  return COLUMNS.filter((c) => c.label && cells[c.key])
    .map((c) => `${c.label}: ${tidy(cells[c.key])}`)
    .join('\n')
}

function tidy(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim()
}

export function chunkEntry(entry, meta) {
  const label = `${entry.number}${entry.subsection || ''}`
  const heading = `BNSS First Schedule - classification of ${ACT_SHORT} section ${label}`
  const budget = MAX_CHARS - heading.length - 2
  const blocks = entry.rows.map(renderRow)

  const parts = []
  let buf = ''
  for (const block of blocks.flatMap((b) => splitOversized(b, budget))) {
    if (buf && buf.length + block.length + 2 > budget) {
      parts.push(buf)
      buf = ''
    }
    buf = buf ? `${buf}\n\n${block}` : block
  }
  if (buf) parts.push(buf)

  const title = firstOffence(entry)
  return parts.map((text, i) => ({
    act: ACT,
    act_short: ACT_SHORT,
    source_type: 'schedule',
    chapter: 'First Schedule',
    chapter_title: 'Classification Of Offences',
    section_number: entry.number,
    section_title: title,
    subsection: entry.subsection,
    clause: null,
    text: `${heading}.\n${text}`,
    embed_text: `${heading}\n${title}\n${text}`,
    has_illustration: false,
    has_proviso: false,
    has_exception: false,
    has_explanation: false,
    references: [],
    page_start: entry.pageStart,
    page_end: entry.pageEnd,
    chunk_id: `bnss-sch1-s${label.replace(/[()]/g, '')}-${String(i + 1).padStart(3, '0')}`,
    source_uri: meta.sourceUri,
    ingested_at: meta.ingestedAt,
  }))
}

// one row with more text than a chunk can hold, cut it between columns
function splitOversized(block, budget) {
  if (block.length <= budget) return [block]
  const out = []
  let buf = ''
  for (const line of block.split('\n')) {
    if (buf && buf.length + line.length + 1 > budget) {
      out.push(buf)
      buf = ''
    }
    buf = buf ? `${buf}\n${line}` : line
  }
  if (buf) out.push(buf)
  return out
}

function firstOffence(entry) {
  const offence = entry.rows.find((r) => r.offence)?.offence || ''
  return tidy(offence).replace(/\.$/, '')
}

export async function buildScheduleChunks(pdfPath, meta) {
  const doc = await openPdf(pdfPath)
  const rows = []
  for (let p = SCHEDULE_PAGES.from; p <= Math.min(SCHEDULE_PAGES.to, doc.numPages); p++) {
    rows.push(...rowsFromPage(await extractRuns(doc, p), p))
  }

  const entries = collectEntries(rows)
  const ingestedAt = meta.ingestedAt || new Date().toISOString()
  const chunks = entries.flatMap((e) => chunkEntry(e, { sourceUri: meta.sourceUri, ingestedAt }))
  return { entries, chunks }
}
