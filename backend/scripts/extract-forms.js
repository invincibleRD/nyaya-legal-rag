import path from 'node:path'
import { extractForms } from '../src/forms/extract.js'
import { config } from '../src/core/config.js'
import { logger } from '../src/core/logger.js'

const pdfPath = process.argv[2] || config.corpus.sourcePdf
const outDir = process.argv[3] || path.join(config.corpus.dataDir, 'forms')

const started = Date.now()
const { manifest, manifestPath } = await extractForms({
  pdfPath,
  outDir,
  from: config.corpus.formsPageStart,
  to: config.corpus.formsPageEnd,
  sourceUri: config.corpus.sourceUri,
  log: (line) => logger.debug(line),
})

const flagged = manifest.forms.filter((f) => f.needs_review)
logger.info(
  {
    forms: manifest.form_count,
    needs_review: flagged.length,
    ms: Date.now() - started,
    manifest: manifestPath,
  },
  'forms extracted'
)
for (const f of flagged) {
  logger.warn({ form: f.form_number, reasons: f.review_reasons }, 'form needs review')
}
