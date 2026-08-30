import { extractRange } from './pdfText.js'

export const ACT = 'Bharatiya Nagarik Suraksha Sanhita, 2023'
export const ACT_SHORT = 'BNSS'

const SECTION_PAGES = { from: 1, to: 157 }
const MAX_CHARS = 1800 // bge-base-en-v1.5 tops out at 512 tokens; this leaves room for the heading prefix

const ROMAN = /^CHAPTER\s+([IVXLC]+)$/
const SECTION_START = /^(\d{1,3})\.\s*(?=\(1\)|[A-Z"(])/
const SUBSECTION_START = /^\((\d{1,2})\)\s/
const CLAUSE_START = /^\(([a-z]{1,2})\)\s/
const ATTACHED = /^(Provided|Explanation|Exception|Illustration|Illustrations)\b/

// sections are sequential, so only accept the number we expect next
const INDENT_MIN = 130
const INDENT_MAX = 155

// rejoin lines, fix hyphen breaks, remember which page each bit came from
function joinLines(lines) {
  let out = ''
  const offsets = []
  for (const line of lines) {
    if (!out) {
      out = line.text
    } else if (/-$/.test(out) && /^[a-z]/.test(line.text)) {
      out = out.slice(0, -1) + line.text
    } else {
      out += ' ' + line.text
    }
    offsets.push({ page: line.page, end: out.length })
  }
  return { text: out, offsets }
}

function pagesFor(offsets, start, end) {
  const pages = offsets
    .filter((o) => o.end >= start)
    .filter((o, i, arr) => {
      const prevEnd = i === 0 ? 0 : arr[i - 1].end
      return prevEnd <= end
    })
  const list = pages.length ? pages.map((o) => o.page) : offsets.map((o) => o.page)
  return { start: Math.min(...list), end: Math.max(...list) }
}

export function findReferences(text) {
  const refs = new Set()
  const re = /\bsections?\s+(\d{1,3})(?:\s*(?:,|and|to|or)\s*(\d{1,3}))*/gi
  for (const m of text.matchAll(re)) {
    refs.add(m[1])
    if (m[2]) refs.add(m[2])
  }
  return [...refs].sort((a, b) => Number(a) - Number(b))
}

// cut the page stream into sections
export function collectSections(pages) {
  const sections = []
  let chapter = null
  let chapterTitle = null
  let pendingChapter = false
  let current = null
  let expected = 1

  for (const page of pages) {
    for (const line of page.bodyLines) {
      const roman = line.text.match(ROMAN)
      if (roman) {
        chapter = roman[1]
        chapterTitle = null
        pendingChapter = true
        continue
      }
      if (pendingChapter) {
        // title is the caps line right after
        if (/^[A-Z][A-Z\s,'’\-()]+$/.test(line.text)) {
          chapterTitle = chapterTitle ? `${chapterTitle} ${line.text}` : line.text
          continue
        }
        pendingChapter = false
      }

      const start = line.text.match(SECTION_START)
      const indented = line.x > INDENT_MIN && line.x < INDENT_MAX
      if (start && indented && Number(start[1]) === expected) {
        current = {
          number: String(expected),
          chapter,
          chapterTitle: titleCase(chapterTitle),
          title: null,
          headingY: line.y,
          startPage: page.pageNumber,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          lines: [{ text: line.text.slice(start[0].length), page: page.pageNumber }],
        }
        sections.push(current)
        expected++
        continue
      }

      if (current) {
        current.lines.push({ text: line.text, page: page.pageNumber })
        current.pageEnd = page.pageNumber
      }
    }

    assignTitles(page, sections)
  }

  return sections
}

// two notes merge into one block when sections sit close, split them back apart
const ACT_REFERENCE = /^\d+\s+of\s+\d{4}\b/

function pageNotes(page) {
  const notes = []
  for (const block of page.marginBlocks) {
    const parts = block.text.split(/(?<=\.)\s+(?=[A-Z])/)
    parts.forEach((text, i) => {
      const trimmed = text.trim()
      if (!trimmed || ACT_REFERENCE.test(trimmed)) return
      notes.push({ topY: block.topY, order: i, text: trimmed })
    })
  }
  return notes.sort((a, b) => b.topY - a.topY || a.order - b.order)
}

function assignTitles(page, sections) {
  const onPage = sections
    .filter((s) => s.startPage === page.pageNumber)
    .sort((a, b) => b.headingY - a.headingY)
  const notes = pageNotes(page)

  if (notes.length === onPage.length) {
    onPage.forEach((s, i) => {
      if (!s.title) s.title = cleanTitle(notes[i].text)
    })
    return
  }

  // counts disagree, match on position instead
  for (const note of notes) {
    let best = null
    let bestGap = Infinity
    for (const s of onPage) {
      if (s.title) continue
      const gap = Math.abs(s.headingY - note.topY)
      if (gap < bestGap) {
        bestGap = gap
        best = s
      }
    }
    if (best && bestGap < 40) best.title = cleanTitle(note.text)
  }
}

function cleanTitle(text) {
  return text.replace(/\.$/, '').replace(/\s+/g, ' ').trim()
}

function titleCase(text) {
  if (!text) return null
  return text
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// split into blocks we can safely cut between. a proviso on its own is
// worse than useless, so it always stays with the clause above it
export function toBlocks(text) {
  const parts = splitOnMarkers(text)
  const blocks = []
  for (const part of parts) {
    if (ATTACHED.test(part) && blocks.length) {
      blocks[blocks.length - 1].text += ' ' + part
      continue
    }
    const sub = part.match(SUBSECTION_START)
    blocks.push({ label: sub ? `(${sub[1]})` : null, text: part })
  }
  return blocks
}

function splitOnMarkers(text) {
  // only at a sentence boundary
  const marked = text
    .replace(/\s(\(\d{1,2}\))\s(?=[A-Z"(])/g, '\n$1 ')
    .replace(/\s(Provided\b)/g, '\n$1')
    .replace(/\s(Explanation\b)/g, '\n$1')
    .replace(/\s(Exception\b)/g, '\n$1')
    .replace(/\s(Illustrations?\b)/g, '\n$1')
  return marked
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function packBlocks(blocks) {
  const packed = []
  let buf = null
  for (const block of blocks) {
    if (buf && buf.text.length + block.text.length + 1 > MAX_CHARS) {
      packed.push(buf)
      buf = null
    }
    if (!buf) buf = { label: block.label, text: block.text }
    else buf.text += ' ' + block.text
  }
  if (buf) packed.push(buf)
  return packed
}

// oversized subsection, cut at lettered clauses
function splitOversized(block) {
  if (block.text.length <= MAX_CHARS) return [block]
  let pieces = block.text
    .replace(/\s(\([a-z]{1,2}\))\s/g, '\n$1 ')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  // no clauses to cut on, fall back to sentences
  if (pieces.some((p) => p.length > MAX_CHARS)) {
    pieces = pieces.flatMap((p) =>
      p.length <= MAX_CHARS ? [p] : p.split(/(?<=[.:;])\s+(?=[A-Z(])/).map((x) => x.trim())
    )
  }
  const out = []
  let buf = ''
  for (const piece of pieces) {
    if (buf && buf.length + piece.length + 1 > MAX_CHARS) {
      out.push({ label: block.label, text: buf })
      buf = ''
    }
    buf = buf ? buf + ' ' + piece : piece
  }
  if (buf) out.push({ label: block.label, text: buf })
  return out
}

export function chunkSection(section, meta) {
  const { text, offsets } = joinLines(section.lines)
  const heading = `${ACT_SHORT} Section ${section.number}${section.title ? ' - ' + section.title : ''}`

  let parts
  if (text.length <= MAX_CHARS) {
    parts = [{ label: null, text }]
  } else {
    parts = packBlocks(toBlocks(text)).flatMap(splitOversized)
  }

  let cursor = 0
  return parts.map((part, i) => {
    const clause = part.text.match(CLAUSE_START)
    const at = text.indexOf(part.text, cursor)
    const span = at === -1 ? null : pagesFor(offsets, at, at + part.text.length)
    if (at !== -1) cursor = at + part.text.length
    return {
      act: ACT,
      act_short: ACT_SHORT,
      chapter: section.chapter,
      chapter_title: section.chapterTitle,
      section_number: section.number,
      section_title: section.title,
      subsection: parts.length > 1 ? part.label : null,
      clause: clause ? `(${clause[1]})` : null,
      text: part.text,
      // heading rides along so a fragment is still findable by its title
      embed_text: `${heading}\n${part.text}`,
      has_illustration: /\bIllustrations?\b/.test(part.text),
      has_proviso: /\bProvided\b/.test(part.text),
      has_exception: /\bException\b/.test(part.text),
      has_explanation: /\bExplanation\b/.test(part.text),
      references: findReferences(part.text),
      page_start: span ? span.start : section.pageStart,
      page_end: span ? span.end : section.pageEnd,
      chunk_id: `bnss-s${section.number}-${String(i + 1).padStart(3, '0')}`,
      source_uri: meta.sourceUri,
      ingested_at: meta.ingestedAt,
    }
  })
}

export async function buildStatuteChunks(pdfPath, meta) {
  const { pages } = await extractRange(pdfPath, SECTION_PAGES.from, SECTION_PAGES.to)
  const sections = collectSections(pages)
  const ingestedAt = new Date().toISOString()
  const chunks = sections.flatMap((s) => chunkSection(s, { sourceUri: meta.sourceUri, ingestedAt }))
  return { sections, chunks }
}
