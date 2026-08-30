import { extractRange } from './pdfText.js'
import { pointId } from './index.js'
import { buildStats, encodeDocument } from '../retrieval/bm25.js'
import { loadStats, saveStats } from '../retrieval/stats.js'
import { embed } from '../retrieval/embeddings.js'
import { ensureCollection, upsert, removeByFilter, DENSE, SPARSE } from '../retrieval/qdrant.js'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'

const BATCH = 32
const MAX_PAGES = 300
const TARGET = 1500
const OVERLAP = 150

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// an uploaded pdf has no paragraph marks, so a bigger than usual line gap is
// the only break we get. side notes are body text in an arbitrary file.
export function pageToText(page) {
  const lines = [
    ...(page.bodyLines || []),
    ...(page.marginBlocks || []).map((b) => ({ y: b.topY, text: b.text })),
  ].sort((a, b) => b.y - a.y)
  if (!lines.length) return ''

  const gaps = []
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y)
  const normal = gaps.length ? median(gaps) : 0

  let out = lines[0].text
  for (let i = 1; i < lines.length; i++) {
    out += (gaps[i - 1] > normal * 1.6 ? '\n\n' : '\n') + lines[i].text
  }
  return out
}

// a table dump or a paragraph-free scan still has to be cut somewhere
function cut(text, target) {
  if (text.length <= target) return [text]
  const out = []
  let buf = ''
  for (const sentence of text.split(/(?<=[.?!])\s+/)) {
    if (buf && buf.length + sentence.length + 1 > target) {
      out.push(buf)
      buf = ''
    }
    buf = buf ? `${buf} ${sentence}` : sentence
    while (buf.length > target) {
      const at = buf.lastIndexOf(' ', target)
      out.push(buf.slice(0, at > 0 ? at : target))
      buf = buf.slice(at > 0 ? at + 1 : target)
    }
  }
  if (buf) out.push(buf)
  return out
}

function paragraphs(pages, target) {
  const out = []
  for (const page of pages || []) {
    for (const block of String(page?.text || '').split(/\n\s*\n+/)) {
      const clean = block
        .replace(/-\n(?=[a-z])/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!clean) continue
      for (const piece of cut(clean, target)) out.push({ page: page.page, text: piece })
    }
  }
  return out
}

export function chunkPages(pages, { target = TARGET, overlap = OVERLAP } = {}) {
  const chunks = []
  let text = ''
  let pageStart = null
  let pageEnd = null

  const flush = () => {
    if (text.trim()) chunks.push({ text: text.trim(), page_start: pageStart, page_end: pageEnd })
  }

  for (const para of paragraphs(pages, target)) {
    if (text && text.length + para.text.length + 2 > target) {
      flush()
      // the carried tail came off the previous page, keep that page on the chunk
      text = text.slice(-overlap).replace(/^\S*\s/, '')
      pageStart = text ? pageEnd : para.page
    }
    text = text ? `${text}\n\n${para.text}` : para.text
    if (pageStart === null) pageStart = para.page
    pageEnd = para.page
  }
  flush()

  return chunks
}

export function toDocumentPoints(chunks, vectors, stats, { documentId, sessionId, filename }) {
  return chunks.map((chunk, i) => ({
    id: pointId(`${documentId}-${i}`),
    vector: {
      [DENSE]: vectors[i],
      [SPARSE]: encodeDocument(chunk.text, stats),
    },
    payload: {
      session_id: sessionId,
      document_id: documentId,
      document_name: filename,
      chunk_index: i,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      text: chunk.text,
    },
  }))
}

// every upload shares one collection, so add to the stats instead of replacing
// them, otherwise queries score against whatever file landed last
function mergeStats(prev, next) {
  if (!prev) return next
  const df = { ...prev.df }
  for (const [term, n] of Object.entries(next.df)) df[term] = (df[term] || 0) + n
  const count = prev.count + next.count
  return {
    count,
    avgLength: (prev.avgLength * prev.count + next.avgLength * next.count) / count,
    df,
  }
}

export async function ingestDocument({
  documentId,
  sessionId,
  filePath,
  filename,
  onProgress = () => {},
}) {
  const started = Date.now()
  const collection = config.qdrant.docsCollection

  await onProgress('parsing', 0)
  const { pages } = await extractRange(filePath, 1, MAX_PAGES)
  await onProgress('parsing', 1)

  await onProgress('chunking', 0)
  const chunks = chunkPages(pages.map((p) => ({ page: p.pageNumber, text: pageToText(p) })))
  if (!chunks.length) throw new Error('no text found in the pdf, it may be a scan')
  await onProgress('chunking', 1)

  await ensureCollection(collection)
  const stats = mergeStats(loadStats(collection), buildStats(chunks.map((c) => c.text)))
  saveStats(collection, stats)

  await onProgress('embedding', 0)
  let done = 0
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH)
    const vectors = await embed(slice.map((c) => c.text))
    await upsert(
      collection,
      toDocumentPoints(slice, vectors, stats, { documentId, sessionId, filename })
    )
    done += slice.length
    await onProgress('embedding', done / chunks.length)
  }

  await onProgress('ready', 1)
  const ms = Date.now() - started
  logger.info({ documentId, pages: pages.length, chunks: chunks.length, ms }, 'document ingested')
  return { pages: pages.length, chunks: chunks.length, ms }
}

export async function purgeDocument({ documentId, sessionId }) {
  await removeByFilter(config.qdrant.docsCollection, {
    must: [
      { key: 'document_id', match: { value: documentId } },
      { key: 'session_id', match: { value: sessionId } },
    ],
  })
  logger.info({ documentId, sessionId }, 'document vectors purged')
}
