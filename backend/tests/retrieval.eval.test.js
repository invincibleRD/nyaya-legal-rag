import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { config } from '../src/core/config.js'

// a slice of the golden set, so a retrieval regression fails the build rather
// than waiting to be noticed in the full eval run
const GOLDEN = new URL('../../eval/golden_set.jsonl', import.meta.url).pathname
const SUBSET = 8

async function stackIsUp() {
  try {
    const res = await fetch(`${config.qdrant.url}/readyz`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

const up = fs.existsSync(GOLDEN) && (await stackIsUp())

describe.runIf(up)('golden set retrieval', () => {
  const rows = fs
    .readFileSync(GOLDEN, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.type !== 'must_refuse')
    .slice(0, SUBSET)

  it.each(rows)(
    'finds $expected_sections for "$q"',
    async (row) => {
      const { retrieve } = await import('../src/retrieval/hybrid.js')
      const found = await retrieve({ query: row.q, topK: 10 })
      const ranked = found.results.map((r) => `${r.act_short} s.${r.section_number}`)
      expect(ranked.some((s) => row.expected_sections.includes(s))).toBe(true)
    },
    30000
  )
})
