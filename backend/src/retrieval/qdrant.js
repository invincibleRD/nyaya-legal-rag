import { QdrantClient } from '@qdrant/js-client-rest'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'

export const qdrant = new QdrantClient({ url: config.qdrant.url, checkCompatibility: false })

export const DENSE = 'dense'
export const SPARSE = 'bm25'

export async function ensureCollection(name) {
  const { collections } = await qdrant.getCollections()
  if (collections.some((c) => c.name === name)) return false

  await qdrant.createCollection(name, {
    vectors: { [DENSE]: { size: config.embedding.dim, distance: 'Cosine' } },
    sparse_vectors: { [SPARSE]: {} },
  })

  // fields we filter on, indexed so filtering stays cheap
  for (const [field, schema] of Object.entries({
    section_number: 'keyword',
    act_short: 'keyword',
    chapter: 'keyword',
    document_id: 'keyword',
    session_id: 'keyword',
  })) {
    await qdrant.createPayloadIndex(name, { field_name: field, field_schema: schema, wait: true })
  }

  logger.info({ collection: name }, 'created collection')
  return true
}

export async function upsert(name, points) {
  await qdrant.upsert(name, { wait: true, points })
}

export async function search(name, { vector, sparse, filter, limit }) {
  const query = sparse ? { indices: sparse.indices, values: sparse.values } : vector
  const res = await qdrant.query(name, {
    query,
    using: sparse ? SPARSE : DENSE,
    filter,
    limit,
    with_payload: true,
  })
  return res.points || []
}

export async function scroll(name, { filter, limit = 50 }) {
  const res = await qdrant.scroll(name, { filter, limit, with_payload: true })
  return res.points || []
}

export async function removeByFilter(name, filter) {
  await qdrant.delete(name, { filter, wait: true })
}
