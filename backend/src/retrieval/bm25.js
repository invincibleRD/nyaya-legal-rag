import { tokenize } from './tokenize.js'

const K1 = 1.2
const B = 0.75

// qdrant scores sparse vectors with a dot product, so we split bm25 in two:
// the document side carries term saturation, the query side carries idf.
export function buildStats(docs) {
  const df = new Map()
  let totalLength = 0

  for (const text of docs) {
    const tokens = tokenize(text)
    totalLength += tokens.length
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1)
  }

  return {
    count: docs.length,
    avgLength: docs.length ? totalLength / docs.length : 0,
    df: Object.fromEntries(df),
  }
}

export function idf(stats, term) {
  const n = stats.df[term] || 0
  // unseen terms still score, just weakly
  return Math.log(1 + (stats.count - n + 0.5) / (n + 0.5))
}

export function encodeDocument(text, stats) {
  const tokens = tokenize(text)
  const tf = new Map()
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)

  const norm = stats.avgLength ? tokens.length / stats.avgLength : 1
  const indices = []
  const values = []
  for (const [term, freq] of tf) {
    indices.push(termId(term))
    values.push((freq * (K1 + 1)) / (freq + K1 * (1 - B + B * norm)))
  }
  return { indices, values }
}

export function encodeQuery(text, stats) {
  const seen = new Set()
  const indices = []
  const values = []
  for (const term of tokenize(text)) {
    if (seen.has(term)) continue
    seen.add(term)
    indices.push(termId(term))
    values.push(idf(stats, term))
  }
  return { indices, values }
}

// fnv-1a, so a term maps to the same slot without shipping a vocab file
export function termId(term) {
  let h = 0x811c9dc5
  for (let i = 0; i < term.length; i++) {
    h ^= term.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 1
}
