import { config } from '../../core/config.js'

const MARKER = /\[\s*BNSS\s*s\.?\s*(\d+[A-Z]?)((?:\s*\([^)\]]{1,12}\))*)\s*\]/gi

export function validateCitations({ answer, contexts = [] }) {
  const bySection = new Map()
  for (const ctx of contexts) {
    const section = ctx?.section_number != null ? String(ctx.section_number) : ''
    if (section && !bySection.has(section)) bySection.set(section, ctx)
  }

  const stripped = []
  const kept = []

  const text = String(answer || '').replace(MARKER, (marker, section, subsection) => {
    if (!bySection.has(section)) {
      if (!stripped.includes(marker)) stripped.push(marker)
      return ''
    }
    const clean = `[BNSS s.${section}${subsection.replace(/\s+/g, '')}]`
    if (!kept.some((k) => k.marker === clean)) {
      kept.push({ marker: clean, context: bySection.get(section), subsection: subsection.trim() })
    }
    return clean
  })

  return {
    text: tidy(text),
    citations: buildCitations(kept),
    stripped,
    valid: stripped.length === 0,
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
  const best = Math.max(...results.map((r) => r.fused_score ?? r.score ?? 0))
  return best < threshold
}

function tidy(text) {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}
