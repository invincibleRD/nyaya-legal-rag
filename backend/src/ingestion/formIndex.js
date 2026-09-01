import fs from 'node:fs'
import path from 'node:path'
import { toTitleCase } from '../forms/slug.js'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'

// the forms are prescribed by the second schedule under a named section, so a
// question about one ("summons to an accused person") is answerable from the
// manifest the extractor already writes
export function buildFormChunks(meta) {
  const file = path.join(config.corpus.dataDir, 'forms', 'forms_manifest.json')
  if (!fs.existsSync(file)) {
    logger.warn('no forms manifest, skipping the second schedule')
    return []
  }

  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  const ingestedAt = meta.ingestedAt || new Date().toISOString()

  return manifest.forms.map((form) => {
    const title = toTitleCase(form.title)
    const sections = String(form.see_section || '')
      .split(/[,\s]+and\s+|,\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
    const under = sections.length ? ` under section ${sections.join(' and ')} of the BNSS` : ''
    const text = `The Second Schedule to the BNSS prescribes Form No. ${form.form_number}, ${title}${under}.`

    return {
      act: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
      act_short: 'BNSS',
      source_type: 'form',
      chapter: 'Second Schedule',
      chapter_title: 'Forms',
      // cite the section the form is prescribed under, that is what it belongs to
      section_number: sections[0]?.replace(/\(.*/, '') || null,
      section_title: `Form No. ${form.form_number} - ${title}`,
      subsection: null,
      clause: null,
      text,
      embed_text: `BNSS Second Schedule - Form No. ${form.form_number}\n${title}\n${text}`,
      has_illustration: false,
      has_proviso: false,
      has_exception: false,
      has_explanation: false,
      references: sections.map((s) => s.replace(/\(.*/, '')),
      page_start: form.page_start,
      page_end: form.page_end,
      form_number: form.form_number,
      form_filename: form.filename,
      chunk_id: `bnss-form-${String(form.form_number).padStart(3, '0')}`,
      source_uri: meta.sourceUri,
      ingested_at: ingestedAt,
    }
  })
}
