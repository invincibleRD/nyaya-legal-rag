import { config } from '../core/config.js'
import { logger } from '../core/logger.js'

const TIMEOUT_MS = 8000

// dense and sparse both score the query and the passage apart from each other.
// a cross encoder reads them together, which is what catches the section that
// answers the question over the one that merely shares its words.
export async function rerankTexts(query, texts, { signal } = {}) {
  const res = await fetch(`${config.rerank.url}/rerank`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, texts, raw_scores: false, return_text: false }),
    signal: signal || AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`reranker replied ${res.status}`)
  return res.json()
}

// only the shortlist goes to the cross encoder, the rest keeps its fused order
export async function rerank(query, rows, { signal } = {}) {
  if (!config.rerank.enabled || rows.length < 2) return rows

  const shortlist = rows.slice(0, config.rerank.poolSize)
  const rest = rows.slice(config.rerank.poolSize)
  const started = Date.now()

  try {
    const scored = await rerankTexts(
      query,
      shortlist.map((r) => textOf(r)),
      { signal }
    )
    const byIndex = new Map(scored.map((s) => [s.index, s.score]))
    const reordered = shortlist
      .map((row, i) => ({ ...row, rerank_score: byIndex.get(i) ?? 0 }))
      .sort((a, b) => b.rerank_score - a.rerank_score)

    logger.debug({ candidates: shortlist.length, ms: Date.now() - started }, 'reranked')
    return [...reordered, ...rest]
  } catch (err) {
    // a slow or missing reranker must not cost the user their answer
    logger.warn({ err: err.message }, 'reranker unavailable, keeping the fused order')
    return rows
  }
}

// the heading carries the section title, which is often the strongest signal.
// the cross encoder costs time per token, and the opening of a provision is
// what decides it, so the tail of a long chunk is not worth the wait.
function textOf(row) {
  const p = row.item?.payload || {}
  return (p.embed_text || p.text || '').slice(0, config.rerank.maxChars)
}
