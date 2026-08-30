import { config } from '../../core/config.js'

// anything bracket shaped that looks like a citation. deliberately loose: if we
// cannot parse it we still have to judge it, otherwise "[BNSS s.103 and s.999]"
// walks straight through.
const CANDIDATE = /\[[^\]\n]{0,80}\]/g
const LOOKS_LEGAL = /\d/
const ACT_HINT = /\b(?:BNSS|BNS|CrPC|IPC|s\.|ss\.|sec|section|§)/i

// one act, one section, optional subsections
const STRICT =
  /^\[\s*([A-Za-z]{2,5})\s*(?:s|ss|sec|section|§)?\.?\s*(\d+[A-Z]?)((?:\s*\([^)\]]{1,8}\))*)\s*\]$/i

// bare prose, "under section 999 of the BNSS"
const PROSE = /\b(?:section|sec\.|s\.)\s*(\d{1,3}[A-Z]?)\b/gi

// one marker, one verdict. the streaming path needs this per marker as tokens
// arrive, the batch path needs it over a finished answer.
export function makeMarkerChecker(contexts = []) {
  const known = indexContexts(contexts)
  return function check(marker) {
    if (!LOOKS_LEGAL.test(marker) || !ACT_HINT.test(marker)) {
      return { verdict: 'not-a-citation', text: marker }
    }
    const parsed = STRICT.exec(marker)
    if (!parsed) return { verdict: 'invented', text: '' }

    const [, act, section, subs] = parsed
    const ctx = known.lookup(act, section, subs)
    if (!ctx) return { verdict: 'invented', text: '' }

    const clean = `[${ctx.act_short || act.toUpperCase()} s.${section}${subs.replace(/\s+/g, '')}]`
    return { verdict: 'ok', text: clean, context: ctx, subsection: subs.trim() }
  }
}

export function validateCitations({ answer, contexts = [] }) {
  const known = indexContexts(contexts)
  const stripped = []
  const kept = []

  let text = String(answer || '').replace(CANDIDATE, (marker) => {
    if (!LOOKS_LEGAL.test(marker) || !ACT_HINT.test(marker)) return marker

    const parsed = STRICT.exec(marker)
    if (!parsed) {
      // bracket-shaped and legal-looking but not a marker we can check
      return drop(marker, stripped)
    }

    const [, act, section, subs] = parsed
    const ctx = known.lookup(act, section, subs)
    if (!ctx) return drop(marker, stripped)

    const clean = `[${ctx.act_short || act.toUpperCase()} s.${section}${subs.replace(/\s+/g, '')}]`
    if (!kept.some((k) => k.marker === clean)) {
      kept.push({ marker: clean, context: ctx, subsection: subs.trim() })
    }
    return clean
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

  return {
    hasSection: (section) => rows.some((r) => r._section === String(section)),
    lookup(act, section, subs) {
      const wanted = String(section)
      const matches = rows.filter((r) => r._section === wanted)
      if (!matches.length) return null
      // the act has to be one we actually retrieved, BNS and BNSS are different acts
      const sameAct = matches.filter((r) => !r._act || r._act === act.toUpperCase())
      if (!sameAct.length) return null

      // bind to the chunk that really holds this subsection, otherwise the
      // source panel shows a passage the citation is not in
      const label = (subs || '').replace(/\s+/g, '')
      if (label) {
        const exact = sameAct.find((r) => (r.subsection || '').replace(/\s+/g, '') === label)
        if (exact) return exact
        const inText = sameAct.find((r) => (r.text || '').includes(label))
        if (inText) return inText
      }
      return sameAct[0]
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
