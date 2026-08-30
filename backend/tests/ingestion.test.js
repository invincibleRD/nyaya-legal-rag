import { describe, it, expect } from 'vitest'
import { pointId, toPoints } from '../src/ingestion/index.js'
import { buildStats } from '../src/retrieval/bm25.js'

const chunk = (id, text) => ({
  chunk_id: id,
  embed_text: text,
  text,
  section_number: '63',
  act_short: 'BNSS',
})

describe('pointId', () => {
  it('is a uuid qdrant will accept', () => {
    expect(pointId('bnss-s63-001')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('is stable, so re-ingesting overwrites instead of duplicating', () => {
    expect(pointId('bnss-s63-001')).toBe(pointId('bnss-s63-001'))
    expect(pointId('bnss-s63-001')).not.toBe(pointId('bnss-s63-002'))
  })
})

describe('toPoints', () => {
  it('carries both a dense and a sparse vector plus the payload', () => {
    const chunks = [chunk('bnss-s63-001', 'form of summons issued by a court')]
    const stats = buildStats(chunks.map((c) => c.embed_text))
    const points = toPoints(chunks, [[0.1, 0.2, 0.3]], stats)

    expect(points).toHaveLength(1)
    expect(points[0].vector.dense).toEqual([0.1, 0.2, 0.3])
    expect(points[0].vector.bm25.indices.length).toBeGreaterThan(0)
    expect(points[0].vector.bm25.indices.length).toBe(points[0].vector.bm25.values.length)
    expect(points[0].payload.section_number).toBe('63')
  })
})
