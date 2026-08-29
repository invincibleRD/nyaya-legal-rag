import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// section titles sit in a side column, smaller type, outdented either way
const HEADER_Y = 765
const MARGIN_MAX_HEIGHT = 9
const MARGIN_LEFT_X = 110
const MARGIN_RIGHT_X = 470
const LINE_TOLERANCE = 2.5
const MARGIN_BLOCK_GAP = 15

export async function openPdf(path) {
  const data = new Uint8Array(fs.readFileSync(path))
  return getDocument({ data, useSystemFonts: true }).promise
}

function joinRuns(runs) {
  let out = ''
  let prevEnd = null
  for (const r of runs) {
    if (prevEnd !== null && r.x - prevEnd > 1) out += ' '
    out += r.str
    prevEnd = r.x + r.width
  }
  return out.replace(/\s+/g, ' ').trim()
}

function toLines(runs) {
  const rows = []
  for (const r of runs.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((g) => Math.abs(g.y - r.y) <= LINE_TOLERANCE)
    if (row) row.runs.push(r)
    else rows.push({ y: r.y, runs: [r] })
  }
  return rows
    .map((g) => {
      const sorted = g.runs.sort((a, b) => a.x - b.x)
      return { y: g.y, x: sorted[0].x, text: joinRuns(sorted) }
    })
    .filter((l) => l.text)
}

export async function extractPage(doc, pageNumber) {
  const page = await doc.getPage(pageNumber)
  const content = await page.getTextContent()

  const body = []
  const margin = []
  for (const item of content.items) {
    if (!item.str.trim()) continue
    const run = {
      x: item.transform[4],
      y: item.transform[5],
      str: item.str,
      width: item.width,
      height: item.height,
    }
    if (run.y > HEADER_Y) continue
    // size alone isn't enough, chapter headings are small caps too
    const outdented = run.x < MARGIN_LEFT_X || run.x > MARGIN_RIGHT_X
    if (run.height < MARGIN_MAX_HEIGHT && outdented) margin.push(run)
    else body.push(run)
  }

  // page number sits alone under the header
  const bodyLines = toLines(body).filter(
    (l) => !(l.y > HEADER_Y - 15 && /^\d{1,3}$/.test(l.text))
  )

  return { pageNumber, bodyLines, marginBlocks: groupMargin(toLines(margin)) }
}

// notes wrap over a few lines, a big vertical gap means a new one
function groupMargin(lines) {
  const blocks = []
  let current = null
  for (const line of lines) {
    if (current && current.lastY - line.y <= MARGIN_BLOCK_GAP) {
      current.parts.push(line.text)
      current.lastY = line.y
    } else {
      current = { topY: line.y, lastY: line.y, parts: [line.text] }
      blocks.push(current)
    }
  }
  return blocks.map((b) => ({ topY: b.topY, text: b.parts.join(' ').replace(/\s+/g, ' ').trim() }))
}

export async function extractRange(pdfPath, from, to) {
  const doc = await openPdf(pdfPath)
  const pages = []
  for (let p = from; p <= Math.min(to, doc.numPages); p++) {
    pages.push(await extractPage(doc, p))
  }
  return { pages, totalPages: doc.numPages }
}
