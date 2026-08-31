// Retrieval and answer quality over eval/golden_set.jsonl.
//
//   node eval/run_eval.js                  retrieval only, every config
//   node eval/run_eval.js --with-answers   also generate, needs an LLM key
//   node eval/run_eval.js --config=hybrid+rerank
//
// Results land in eval/results/<config>.json.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// in the repo the backend sits at backend/src, in the image it is /app/src and
// this file is mounted next to it
const SRC = fs.existsSync(path.join(here, '../backend/src')) ? '../backend/src' : '../src'
const { config } = await import(`${SRC}/core/config.js`)
const { retrieve } = await import(`${SRC}/retrieval/hybrid.js`)

// dense only is the baseline the brief asks us to beat
const CONFIGS = [
  { name: 'dense-only', mode: 'dense', rerank: false },
  { name: 'hybrid', mode: 'hybrid', rerank: false },
  { name: 'hybrid+rerank', mode: 'hybrid', rerank: true },
]

const args = process.argv.slice(2)
const withAnswers = args.includes('--with-answers')
const only = args.find((a) => a.startsWith('--config='))?.split('=')[1]

const golden = fs
  .readFileSync(path.join(here, 'golden_set.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const answerable = golden.filter((g) => g.type !== 'must_refuse')
const refusable = golden.filter((g) => g.type === 'must_refuse')

const key = (r) => `${r.act_short} s.${r.section_number}`
const percentile = (xs, p) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0

async function retrievalPass(cfg) {
  let recall5 = 0
  let recall10 = 0
  let mrr = 0
  const latencies = []
  const misses = []

  for (const row of answerable) {
    const found = await retrieve({ query: row.q, topK: 10, mode: cfg.mode })
    const ranked = found.results.map(key)
    const hits = row.expected_sections.map((want) => ranked.indexOf(want)).filter((i) => i !== -1)
    const best = hits.length ? Math.min(...hits) : -1

    if (best !== -1 && best < 5) recall5++
    if (best !== -1) recall10++
    if (best !== -1) mrr += 1 / (best + 1)
    else
      misses.push({
        q: row.q,
        expected: row.expected_sections,
        got: ranked.slice(0, 3),
      })

    latencies.push(found.took_ms)
  }

  const n = answerable.length
  return {
    questions: n,
    recall_at_5: +(recall5 / n).toFixed(3),
    recall_at_10: +(recall10 / n).toFixed(3),
    mrr_at_10: +(mrr / n).toFixed(3),
    retrieval_p50_ms: percentile(latencies, 0.5),
    retrieval_p95_ms: percentile(latencies, 0.95),
    misses,
  }
}

// citation accuracy: every section the answer cited has to be a section we
// actually retrieved, and at least one of them has to be one we expected.
// the first half is what the output guard enforces, so measuring it catches a
// regression in the guard itself.
async function answerPass(cfg) {
  const { answerStream } = await import(`${SRC}/llm/answer.js`)
  const silent = { info() {}, warn() {}, error() {}, debug() {} }

  let grounded = 0
  let answered = 0
  let refusedInScope = 0
  let refusedOutOfScope = 0
  const retrievalMs = []
  const generationMs = []
  const totalMs = []
  const notes = []

  for (const row of golden) {
    const started = Date.now()
    let citations = []
    let done = null

    for await (const event of answerStream({
      message: row.q,
      sessionId: `eval-${cfg.name}`,
      log: silent,
    })) {
      if (event.type === 'citations') citations = event.citations
      if (event.type === 'done') done = event
    }

    const elapsed = Date.now() - started
    const refused = Boolean(done?.refused)

    if (row.type === 'must_refuse') {
      if (refused) refusedOutOfScope++
      else
        notes.push({
          q: row.q,
          problem: 'answered a question it should have refused',
        })
      continue
    }

    if (refused) {
      refusedInScope++
      notes.push({ q: row.q, problem: `refused in scope (${done?.reason})` })
      continue
    }

    answered++
    retrievalMs.push(done.latency.retrieval_ms)
    generationMs.push(done.latency.generation_ms)
    totalMs.push(elapsed)

    const cited = citations.map((c) => `${c.act_short} s.${c.section_number}`)
    const clean = (done.stripped || []).length === 0
    const relevant = cited.some((c) => row.expected_sections.includes(c))
    if (clean && relevant && cited.length) grounded++
    else notes.push({ q: row.q, problem: 'cited nothing expected', cited })
  }

  return {
    answered,
    refused_in_scope: refusedInScope,
    citation_accuracy: answered ? +(grounded / answered).toFixed(3) : 0,
    refusal_rate_out_of_scope: +(refusedOutOfScope / refusable.length).toFixed(3),
    retrieval_p50_ms: percentile(retrievalMs, 0.5),
    retrieval_p95_ms: percentile(retrievalMs, 0.95),
    generation_p50_ms: percentile(generationMs, 0.5),
    generation_p95_ms: percentile(generationMs, 0.95),
    end_to_end_p50_ms: percentile(totalMs, 0.5),
    end_to_end_p95_ms: percentile(totalMs, 0.95),
    notes,
  }
}

const chosen = only ? CONFIGS.filter((c) => c.name === only) : CONFIGS
if (!chosen.length) throw new Error(`no config named ${only}`)

const report = []
for (const cfg of chosen) {
  config.rerank.enabled = cfg.rerank
  process.stdout.write(`running ${cfg.name} ... `)

  const result = {
    config: cfg,
    ran_at: new Date().toISOString(),
    ...(await retrievalPass(cfg)),
  }
  if (withAnswers) result.answers = await answerPass(cfg)

  fs.writeFileSync(
    path.join(here, 'results', `${cfg.name}.json`),
    JSON.stringify(result, null, 2) + '\n'
  )
  report.push(result)
  console.log('done')
}

const pad = (v, w) => String(v).padEnd(w)
console.log(
  `\n${pad('config', 16)}${pad('R@5', 8)}${pad('R@10', 8)}${pad('MRR', 8)}${pad('p50', 8)}${pad('p95', 8)}`
)
for (const r of report) {
  console.log(
    pad(r.config.name, 16) +
      pad(r.recall_at_5, 8) +
      pad(r.recall_at_10, 8) +
      pad(r.mrr_at_10, 8) +
      pad(r.retrieval_p50_ms + 'ms', 8) +
      pad(r.retrieval_p95_ms + 'ms', 8)
  )
}

if (withAnswers) {
  console.log(
    `\n${pad('config', 16)}${pad('cite acc', 10)}${pad('refusal', 10)}${pad('gen p50', 10)}${pad('gen p95', 10)}`
  )
  for (const r of report) {
    const a = r.answers
    console.log(
      pad(r.config.name, 16) +
        pad(a.citation_accuracy, 10) +
        pad(a.refusal_rate_out_of_scope, 10) +
        pad(a.generation_p50_ms + 'ms', 10) +
        pad(a.generation_p95_ms + 'ms', 10)
    )
  }
}
