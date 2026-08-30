const MARKER = /\[[^[\]\n]{2,80}\]/g

export function indexByMarker(citations) {
  const map = new Map()
  citations.forEach((c, i) => map.set(c.marker, { ...c, index: i + 1 }))
  return map
}

// splits a text run into plain strings and citation marker tokens
export function splitMarkers(text) {
  const out = []
  let last = 0
  for (const m of text.matchAll(MARKER)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ marker: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

export function citationLabel(citation) {
  if (citation.source === 'document') {
    return [citation.document_name, pageLabel(citation)].filter(Boolean).join(' ')
  }
  const section = [citation.section_number, citation.subsection].filter(Boolean).join('')
  return `${citation.act_short} s.${section}`
}

export function pageLabel(c) {
  if (!c.page_start) return ''
  return c.page_end && c.page_end !== c.page_start
    ? `pp. ${c.page_start}-${c.page_end}`
    : `p. ${c.page_start}`
}
