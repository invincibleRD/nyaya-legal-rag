import { embedQuery } from './embeddings.js'
import { encodeQuery } from './bm25.js'
import { loadStats } from './stats.js'
import { search, scroll } from './qdrant.js'
import { rrf } from './fuse.js'
import { rerank } from './rerank.js'
import { detectSectionIntent } from './query.js'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'
import { retrievalDuration, since } from '../core/metrics.js'

function statuteFilter(filters) {
  const must = []
  if (filters.act_short) must.push({ key: 'act_short', match: { value: filters.act_short } })
  if (filters.chapter) must.push({ key: 'chapter', match: { value: filters.chapter } })
  if (filters.section_number)
    must.push({ key: 'section_number', match: { value: String(filters.section_number) } })
  return must.length ? { must } : undefined
}

function documentFilter({ sessionId, documentIds }) {
  const must = [{ key: 'session_id', match: { value: sessionId } }]
  if (documentIds?.length) must.push({ key: 'document_id', match: { any: documentIds } })
  return { must }
}

export function toCitation(point, source) {
  const p = point.payload
  if (source === 'document') {
    return {
      marker: `[doc: ${p.document_name} p.${p.page_start}]`,
      source: 'document',
      act_short: null,
      section_number: null,
      subsection: null,
      section_title: null,
      chapter: null,
      page_start: p.page_start,
      page_end: p.page_end,
      text: p.text,
      score: point.score,
      document_id: p.document_id,
      document_name: p.document_name,
    }
  }
  const sub = p.subsection ? p.subsection.replace(/[()]/g, '') : null
  return {
    marker: `[${p.act_short} s.${p.section_number}${sub ? `(${sub})` : ''}]`,
    source: 'statute',
    act_short: p.act_short,
    section_number: p.section_number,
    subsection: p.subsection,
    section_title: p.section_title,
    chapter: p.chapter,
    page_start: p.page_start,
    page_end: p.page_end,
    text: p.text,
    references: p.references || [],
    score: point.score,
    document_id: null,
    document_name: null,
  }
}

async function hybridSearch(collection, { dense, sparseText, filter, limit, mode }) {
  const stats = loadStats(collection)
  const legs = []

  if (mode !== 'sparse') {
    legs.push(search(collection, { vector: dense, filter, limit }))
  }
  if (mode !== 'dense' && stats) {
    legs.push(search(collection, { sparse: encodeQuery(sparseText, stats), filter, limit }))
  }

  const [denseHits = [], sparseHits = []] = await Promise.all(legs)

  // rrf is a rank score, useful for ordering and useless as a confidence. keep
  // the cosine alongside it so the refusal path has a real similarity to judge.
  const cosine = new Map(denseHits.map((p) => [p.id, p.score]))
  return rrf(
    [denseHits, sparseHits].filter((l) => l.length),
    { key: (p) => p.id }
  ).map((row) => ({
    ...row,
    dense_score: cosine.get(row.id) ?? null,
  }))
}

// this corpus is the BNSS, so a section number with no act named is a BNSS one
const DEFAULT_ACT = 'BNSS'

// "what is section 103" must return section 103, not whatever the cosine felt
// like. pull it directly and put it on top.
async function directLookup(collection, intent) {
  const must = [
    { key: 'section_number', match: { value: String(intent.number) } },
    { key: 'act_short', match: { value: intent.act || DEFAULT_ACT } },
  ]
  const points = await scroll(collection, { filter: { must }, limit: 10 })
  return points.sort((a, b) => (a.payload.chunk_id > b.payload.chunk_id ? 1 : -1))
}

// three chunks of the same section crowd out every other section and waste the
// context window, so cap how many of one section can take the top slots
function diversify(ranked, topK, perSection = 2) {
  const taken = new Map()
  const picked = []
  const overflow = []

  for (const row of ranked) {
    const section = row.item?.payload?.section_number || row.item?.payload?.document_id
    const count = taken.get(section) || 0
    if (section && count >= perSection) {
      overflow.push(row)
      continue
    }
    taken.set(section, count + 1)
    picked.push(row)
    if (picked.length === topK) return picked
  }

  return [...picked, ...overflow].slice(0, topK)
}

export async function retrieve({
  query,
  hyde,
  filters = {},
  topK = config.retrieval.topK,
  sessionId,
  documentIds = [],
  mode = 'hybrid',
}) {
  const started = Date.now()
  const pool = config.retrieval.candidatePool
  const statuteCollection = config.qdrant.statuteCollection
  const docsCollection = config.qdrant.docsCollection

  const intent = detectSectionIntent(query)
  const wantsDocuments = documentIds.length > 0
  const route = wantsDocuments ? 'both' : 'statute'

  // hyde only helps the dense leg, keyword matching wants the real words
  const dense = await embedQuery(hyde || query)

  const tasks = [
    hybridSearch(statuteCollection, {
      dense,
      sparseText: query,
      filter: statuteFilter(filters),
      limit: pool,
      mode,
    }).then((rows) => rows.map((r) => ({ ...r, source: 'statute' }))),
  ]

  if (wantsDocuments) {
    tasks.push(
      hybridSearch(docsCollection, {
        dense,
        sparseText: query,
        filter: documentFilter({ sessionId, documentIds }),
        limit: pool,
        mode,
      })
        .then((rows) => rows.map((r) => ({ ...r, source: 'document' })))
        .catch((err) => {
          logger.warn({ err: err.message }, 'document leg failed')
          return []
        })
    )
  }

  const [statuteRows, documentRows = []] = await Promise.all(tasks)

  const fused = [...statuteRows, ...documentRows].sort((a, b) => b.score - a.score)
  // rerank on what the user actually asked, not the hyde passage. a question that
  // names its section is already answered by the lookup below, so it skips the
  // cross encoder and the second it costs.
  let ranked = intent ? fused : await rerank(query, fused)

  if (intent) {
    const exact = await directLookup(statuteCollection, intent)
    const exactIds = new Set(exact.map((p) => p.id))
    ranked = [
      ...exact.map((p) => ({ item: p, score: 1, source: 'statute', exact: true })),
      ...ranked.filter((r) => !exactIds.has(r.id)),
    ]
  }

  const results = diversify(ranked, topK).map((r) => ({
    ...toCitation(r.item, r.source),
    fused_score: r.score,
    dense_score: r.dense_score ?? null,
    rerank_score: r.rerank_score ?? null,
    exact_match: Boolean(r.exact),
  }))

  const topScore = Math.max(0, ...results.map((r) => r.dense_score ?? 0))
  retrievalDuration.observe({ route }, since(started))
  return { results, route, intent, top_score: topScore, took_ms: Date.now() - started }
}
