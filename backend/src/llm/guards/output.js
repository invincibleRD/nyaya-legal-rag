import { config } from '../../core/config.js'

// anything bracket shaped that looks like a citation. deliberately loose: if we
// cannot parse it we still have to judge it, otherwise "[BNSS s.103 and s.999]"
// walks straight through.
const CANDIDATE = /\[[^\]\n]{0,80}\]/g
const LOOKS_LEGAL = /\d/
const ACT_HINT = /\b(?:BNSS|BNS|CrPC|IPC|s\.|ss\.|sec|section|§)/i
const DOC_HINT = /^\[\s*doc\s*:/i

// [doc: notice.pdf p.2], the only shape an upload is cited in
const DOC_MARKER = /^\[\s*doc\s*:\s*(.+?)\s*,?\s*p\.?\s*(\d{1,4})\s*\]$/i

// one act, one section, optional subsections. the context shows a page next to
// every passage and the model copies it into the marker, so a trailing page is
// tolerated and then dropped. the section still has to be one we retrieved.
const STRICT =
  /^\[\s*([A-Za-z]{2,5})\s*(?:s|ss|sec|section|§)?\.?\s*(\d+[A-Z]?)((?:\s*\([^)\]]{1,8}\))*)(?:\s*,?\s*(?:p|pg|page)s?\.?\s*\d{1,4})?\s*\]$/i

// bare prose, "under section 999 of the BNSS"
const PROSE = /\b(?:section|sec\.|s\.)\s*(\d{1,3}[A-Z]?)\b/gi

// one marker, one verdict. the streaming path needs this per marker as tokens
// arrive, the batch path needs it over a finished answer.
export function makeMarkerChecker(contexts = []) {
  const known = indexContexts(contexts)
  return function check(marker) {
    if (DOC_HINT.test(marker)) {
      const doc = DOC_MARKER.exec(marker)
      if (!doc) return { verdict: 'invented', text: '' }
      const ctx = known.lookupDocument(doc[1], doc[2])
      if (!ctx) return { verdict: 'invented', text: '' }
      return {
        verdict: 'ok',
        text: `[doc: ${ctx.document_name} p.${ctx.page_start}]`,
        context: ctx,
        subsection: '',
      }
    }
    if (!LOOKS_LEGAL.test(marker) || !ACT_HINT.test(marker)) {
      return { verdict: 'not-a-citation', text: marker }
    }
    const parsed = STRICT.exec(marker)
    if (!parsed) return { verdict: 'invented', text: '' }

    const [, act, section, subs] = parsed
    const bound = known.lookup(act, section, subs)
    if (!bound) return { verdict: 'invented', text: '' }

    const { row: ctx, subsection } = bound
    const clean = `[${ctx.act_short || act.toUpperCase()} s.${section}${subsection}]`
    return { verdict: 'ok', text: clean, context: ctx, subsection }
  }
}

export function validateCitations({ answer, contexts = [] }) {
  const known = indexContexts(contexts)
  const stripped = []
  const kept = []

  const check = makeMarkerChecker(contexts)
  let text = String(answer || '').replace(CANDIDATE, (marker) => {
    const verdict = check(marker)
    if (verdict.verdict === 'not-a-citation') return marker
    if (verdict.verdict === 'invented') return drop(marker, stripped)
    if (!kept.some((k) => k.marker === verdict.text)) {
      kept.push({ marker: verdict.text, context: verdict.context, subsection: verdict.subsection })
    }
    return verdict.text
  })

  // a section named in plain prose is a citation too, and the easiest to believe
  const invented = new Set()
  for (const m of text.matchAll(PROSE)) {
    if (!known.hasSection(m[1])) invented.add(m[1])
  }

  return {
    text: tidy(text),
    citations: buildCitations(kept),
    stripped,
    invented_in_prose: [...invented],
    valid: stripped.length === 0 && invented.size === 0,
  }
}

// "(a)" has to open a clause, not merely appear somewhere in the passage. the
// labels nest, so (2)(a) is checked one bracket at a time.
function holdsClause(text, label) {
  const parts = label.match(/\([^)]{1,8}\)/g) || []
  if (!parts.length) return false
  return parts.every((part) => {
    const inner = part.slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[\\s.;:—-])\\(${inner}\\)`).test(String(text || ''))
  })
}

function drop(marker, stripped) {
  const key = marker.replace(/\s+/g, ' ')
  if (!stripped.includes(key)) stripped.push(key)
  return ''
}

function indexContexts(contexts) {
  const rows = contexts.filter(Boolean).map((c) => ({
    ...c,
    _section: c.section_number != null ? String(c.section_number) : '',
    _act: (c.act_short || '').toUpperCase(),
  }))

  // sections the retrieved text itself points at. a bracketed marker still has to
  // be a section we actually retrieved, but prose repeating a cross reference the
  // statute makes ("as provided in section 58") is quoting the source, not inventing.
  const mentioned = new Set()
  for (const r of rows) {
    for (const m of String(r.text || '').matchAll(/\bsections?\s+(\d{1,3}[A-Z]?)\b/gi)) {
      mentioned.add(m[1])
    }
    for (const ref of r.references || []) mentioned.add(String(ref))
  }

  return {
    lookupDocument(name, page) {
      const wanted = String(name).trim().toLowerCase()
      const docs = rows.filter((r) => r.source === 'document' && r.document_name)
      const byName = docs.filter((r) => r.document_name.toLowerCase() === wanted)
      const pool = byName.length ? byName : docs
      if (!pool.length) return null
      const n = Number(page)
      return pool.find((r) => n >= r.page_start && n <= (r.page_end ?? r.page_start)) || null
    },
    hasSection: (section) =>
      rows.some((r) => r._section === String(section)) || mentioned.has(String(section)),
    lookup(act, section, subs) {
      const wanted = String(section)
      const matches = rows.filter((r) => r._section === wanted)
      if (!matches.length) return null
      // the act has to be one we actually retrieved, BNS and BNSS are different acts
      const sameAct = matches.filter((r) => !r._act || r._act === act.toUpperCase())
      if (!sameAct.length) return null

      // bind to the chunk that really holds this subsection, otherwise the source
      // panel shows a passage the citation is not in. when nothing holds it we
      // still cite the section, just without claiming the subsection.
      const label = (subs || '').replace(/\s+/g, '')
      if (!label) return { row: sameAct[0], subsection: '' }

      const exact = sameAct.find((r) => (r.subsection || '').replace(/\s+/g, '') === label)
      if (exact) return { row: exact, subsection: label }

      const inText = sameAct.find((r) => holdsClause(r.text, label))
      if (inText) return { row: inText, subsection: label }

      return { row: sameAct[0], subsection: '' }
    },
  }
}

export function buildCitations(referenced) {
  return referenced.map(({ marker, context, subsection }) => ({
    marker,
    source: context.source || 'statute',
    act_short: context.act_short || null,
    section_number: context.section_number != null ? String(context.section_number) : null,
    subsection: subsection || context.subsection || null,
    section_title: context.section_title || null,
    chapter: context.chapter || null,
    page_start: context.page_start ?? null,
    page_end: context.page_end ?? null,
    text: context.text || '',
    score: context.score ?? context.fused_score ?? null,
    document_id: context.document_id || null,
    document_name: context.document_name || null,
  }))
}

export function shouldRefuse({ results, threshold = config.retrieval.confidenceThreshold }) {
  if (!Array.isArray(results) || results.length === 0) return true
  // cosine only. rrf ranks rather than measures, and a bm25 score is on a
  // different scale entirely, so neither can be compared against a threshold.
  // a hit the dense leg never returned counts as no similarity at all.
  const scores = results
    .filter(Boolean)
    .map((r) => (Number.isFinite(r.dense_score) ? r.dense_score : 0))
  if (!scores.length) return true
  return Math.max(...scores) < threshold
}

function tidy(text) {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}
