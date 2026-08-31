import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { config } from '../src/core/config.js'

// The golden set as a regression gate. Known misses are tolerated, a drop below
// the floor is not — so this fails when retrieval gets worse, not when a hard
// question stays hard. Floors sit under the measured numbers, not at them.
const GOLDEN = new URL('../../eval/golden_set.jsonl', import.meta.url).pathname
const RECALL_AT_10_FLOOR = 0.88 // measured 0.96
const MRR_FLOOR = 0.6 // measured 0.716

async function stackIsUp() {
  try {
    const res = await fetch(`${config.qdrant.url}/readyz`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

// without the bm25 stats the sparse leg is skipped and this measures dense-only,
// which passes for a different reason than the one we care about. skip instead.
const STATS = path.join(config.corpus.dataDir, `bm25-${config.qdrant.statuteCollection}.json`)
const up = fs.existsSync(GOLDEN) && fs.existsSync(STATS) && (await stackIsUp())

describe.runIf(up)('golden set retrieval', () => {
  const rows = fs
    .readFileSync(GOLDEN, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.type !== 'must_refuse')

  it('still finds the expected section for the golden set', async () => {
    const { retrieve } = await import('../src/retrieval/hybrid.js')
    let found = 0
    let mrr = 0
    const missed = []

    for (const row of rows) {
      const res = await retrieve({ query: row.q, topK: 10 })
      const ranked = res.results.map((r) => `${r.act_short} s.${r.section_number}`)
      const hits = row.expected_sections.map((s) => ranked.indexOf(s)).filter((i) => i !== -1)
      if (hits.length) {
        found++
        mrr += 1 / (Math.min(...hits) + 1)
      } else {
        missed.push(`${row.expected_sections.join('/')}: ${row.q}`)
      }
    }

    const recall = found / rows.length
    // print what slipped, so a red build says which question broke
    if (recall < RECALL_AT_10_FLOOR) console.error('missed:', missed)

    expect(recall).toBeGreaterThanOrEqual(RECALL_AT_10_FLOOR)
    expect(mrr / rows.length).toBeGreaterThanOrEqual(MRR_FLOOR)
  }, 120000)
})
