import { describe, it, expect } from 'vitest'
import { rrf } from '../src/retrieval/fuse.js'

const p = (id) => ({ id })

describe('rrf', () => {
  it('ranks a document found by both legs above one found by a single leg', () => {
    const dense = [p('a'), p('b'), p('c')]
    const sparse = [p('c'), p('a'), p('d')]
    const fused = rrf([dense, sparse], { k: 60 })
    expect(fused[0].id).toBe('a')
    expect(fused.map((f) => f.id)).toContain('d')
  })

  it('keeps rank positions for debugging', () => {
    const fused = rrf([[p('a')], [p('a')]], { k: 60 })
    expect(fused[0].ranks).toEqual({ 0: 1, 1: 1 })
  })

  it('handles one empty leg', () => {
    const fused = rrf([[p('a'), p('b')], []], { k: 60 })
    expect(fused.map((f) => f.id)).toEqual(['a', 'b'])
  })

  it('scores strictly by rank, not by any incoming score field', () => {
    const dense = [
      { id: 'x', score: 0.99 },
      { id: 'y', score: 0.1 },
    ]
    const fused = rrf([dense], { k: 60 })
    expect(fused[0].score).toBeCloseTo(1 / 61, 6)
    expect(fused[1].score).toBeCloseTo(1 / 62, 6)
  })
})
