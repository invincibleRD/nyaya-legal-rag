// Reranker and fusion knobs, measured against eval/golden_set.jsonl.
//
//   docker compose exec api node eval/sweep.js
//
// This is how RERANK_POOL, RERANK_MAX_CHARS and RRF_K were chosen. Run it where
// the app actually runs: on a CPU the cross encoder dominates the clock and the
// answer comes out different.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = fs.existsSync(path.join(here, '../backend/src')) ? '../backend/src' : '../src'
const { config } = await import(`${SRC}/core/config.js`)
const { retrieve } = await import(`${SRC}/retrieval/hybrid.js`)

const GRID = [
  { name: 'no reranker, RRF k=60', rerank: false, rrfK: 60 },
  { name: 'no reranker, RRF k=20', rerank: false, rrfK: 20 },
  { name: 'pool 6, truncated 700', rerank: true, pool: 6, maxChars: 700, rrfK: 20 },
  { name: 'pool 12, truncated 700', rerank: true, pool: 12, maxChars: 700, rrfK: 20 },
  { name: 'pool 6, full text', rerank: true, pool: 6, maxChars: 1800, rrfK: 20 },
  { name: 'pool 12, full text', rerank: true, pool: 12, maxChars: 1800, rrfK: 20 },
  { name: 'pool 25, full text', rerank: true, pool: 25, maxChars: 1800, rrfK: 20 },
  { name: 'pool 40, full text', rerank: true, pool: 40, maxChars: 1800, rrfK: 20 },
]

const golden = fs
  .readFileSync(path.join(here, 'golden_set.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((g) => g.type !== 'must_refuse')

const key = (r) => `${r.act_short} s.${r.section_number}`
const pct = (xs, p) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0

async function run(cfg) {
  config.rerank.enabled = cfg.rerank
  if (cfg.pool) config.rerank.poolSize = cfg.pool
  if (cfg.maxChars) config.rerank.maxChars = cfg.maxChars
  config.retrieval.rrfK = cfg.rrfK

  let hit1 = 0
  let hit5 = 0
  let hit10 = 0
  let mrr = 0
  const ms = []

  for (const row of golden) {
    const found = await retrieve({ query: row.q, topK: 10, mode: 'hybrid' })
    const ranked = found.results.map(key)
    const hits = row.expected_sections.map((w) => ranked.indexOf(w)).filter((i) => i !== -1)
    const best = hits.length ? Math.min(...hits) : -1
    if (best === 0) hit1++
    if (best !== -1 && best < 5) hit5++
    if (best !== -1) hit10++
    if (best !== -1) mrr += 1 / (best + 1)
    ms.push(found.took_ms)
  }

  const n = golden.length
  return {
    config: cfg.name,
    hit_at_1: +(hit1 / n).toFixed(3),
    recall_at_5: +(hit5 / n).toFixed(3),
    recall_at_10: +(hit10 / n).toFixed(3),
    mrr_at_10: +(mrr / n).toFixed(3),
    p50_ms: pct(ms, 0.5),
    p95_ms: pct(ms, 0.95),
  }
}

const rows = []
for (const cfg of GRID) {
  process.stdout.write(`running ${cfg.name} ... `)
  rows.push(await run(cfg))
  console.log('done')
}

console.log()
console.log(
  ['config', 'hit@1', 'R@5', 'R@10', 'MRR@10', 'p50', 'p95']
    .map((h, i) => (i ? h.padStart(8) : h.padEnd(24)))
    .join('')
)
for (const r of rows) {
  console.log(
    [
      r.config.padEnd(24),
      String(r.hit_at_1).padStart(8),
      String(r.recall_at_5).padStart(8),
      String(r.recall_at_10).padStart(8),
      String(r.mrr_at_10).padStart(8),
      `${r.p50_ms}ms`.padStart(8),
      `${r.p95_ms}ms`.padStart(8),
    ].join('')
  )
}

fs.mkdirSync(path.join(here, 'results'), { recursive: true })
fs.writeFileSync(
  path.join(here, 'results/sweep.json'),
  JSON.stringify({ ran_at: new Date().toISOString(), questions: golden.length, rows }, null, 2)
)
