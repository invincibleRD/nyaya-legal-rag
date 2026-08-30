import { createHash } from 'node:crypto'
import { buildStatuteChunks } from './chunker.js'
import { buildStats, encodeDocument } from '../retrieval/bm25.js'
import { saveStats } from '../retrieval/stats.js'
import { embed } from '../retrieval/embeddings.js'
import { ensureCollection, upsert, DENSE, SPARSE } from '../retrieval/qdrant.js'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'

const BATCH = 64

// qdrant wants a uuid or an integer id, so hash the chunk id into one
export function pointId(chunkId) {
  const h = createHash('sha1').update(chunkId).digest('hex')
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join(
    '-'
  )
}

export function toPoints(chunks, vectors, stats) {
  return chunks.map((chunk, i) => ({
    id: pointId(chunk.chunk_id),
    vector: {
      [DENSE]: vectors[i],
      [SPARSE]: encodeDocument(chunk.embed_text, stats),
    },
    payload: chunk,
  }))
}

export async function ingestStatute({ pdfPath, collection, onProgress = () => {} }) {
  const started = Date.now()
  const { sections, chunks } = await buildStatuteChunks(pdfPath, {
    sourceUri: config.corpus.sourceUri,
  })
  logger.info({ sections: sections.length, chunks: chunks.length }, 'parsed the act')

  const stats = buildStats(chunks.map((c) => c.embed_text))
  saveStats(collection, stats)

  await ensureCollection(collection)

  let done = 0
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH)
    const vectors = await embed(slice.map((c) => c.embed_text))
    await upsert(collection, toPoints(slice, vectors, stats))
    done += slice.length
    onProgress(done / chunks.length)
  }

  const ms = Date.now() - started
  logger.info({ chunks: chunks.length, ms }, 'statute ingested')
  return { sections: sections.length, chunks: chunks.length, ms }
}
