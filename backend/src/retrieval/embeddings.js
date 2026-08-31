import { config } from '../core/config.js'
import { logger } from '../core/logger.js'
import { embeddingDuration, since } from '../core/metrics.js'

// bge wants an instruction on the query side only. getting this wrong silently
// halves recall, so it lives in one place.
function withPrefix(texts, isQuery) {
  if (!isQuery || !config.embedding.queryPrefix) return texts
  return texts.map((t) => `${config.embedding.queryPrefix} ${t}`)
}

async function post(inputs) {
  const res = await fetch(`${config.embedding.url}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inputs, normalize: true, truncate: true }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) {
    throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return res.json()
}

export async function embed(texts, { isQuery = false } = {}) {
  if (!texts.length) return []
  const prepared = withPrefix(texts, isQuery)
  const size = config.embedding.batchSize
  const out = []

  const started = Date.now()
  for (let i = 0; i < prepared.length; i += size) {
    out.push(...(await post(prepared.slice(i, i + size))))
  }
  embeddingDuration.observe({ kind: isQuery ? 'query' : 'passage' }, since(started))
  if (prepared.length > size) {
    const ms = Date.now() - started
    logger.info(
      { count: prepared.length, ms, perSec: Math.round((prepared.length / ms) * 1000) },
      'embedded batch'
    )
  }
  return out
}

export async function embedQuery(text) {
  const [vector] = await embed([text], { isQuery: true })
  return vector
}
