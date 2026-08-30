import { embedQuery } from './embeddings.js'
import { encodeQuery } from './bm25.js'
import { loadStats } from './stats.js'
import { search, scroll } from './qdrant.js'
import { rrf } from './fuse.js'
import { detectSectionIntent } from './query.js'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'

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
      marker: `[${p.document_name} p.${p.page_start}]`,
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

  const results = await Promise.all(legs)
  return rrf(results, { key: (p) => p.id })
}

// "what is section 103" must return section 103, not whatever the cosine felt
// like. pull it directly and put it on top.
async function directLookup(collection, intent) {
  const must = [{ key: 'section_number', match: { value: String(intent.number) } }]
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

  let ranked = [...statuteRows, ...documentRows].sort((a, b) => b.score - a.score)

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
    exact_match: Boolean(r.exact),
  }))

  return { results, route, intent, took_ms: Date.now() - started }
}
