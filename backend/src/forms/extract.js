import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { extractRange } from '../ingestion/pdfText.js'
import { formFilename } from './slug.js'
import { ocrPage } from './ocr.js'

const FORM_HEADER = /^FORM\s*No\.?\s*(\d{1,3})\b/i
const SEE_REF = /^[[(]\s*See\s+sections?\s*(.+?)\s*[\])]\s*$/i

// fixed so a rerun produces byte-identical files
const FIXED_DATE = new Date('2023-12-25T00:00:00Z')

function readTitle(lines, startIndex) {
  const parts = []
  let see = null
  for (let i = startIndex + 1; i < lines.length && i < startIndex + 8; i++) {
    const text = lines[i].text.trim()
    if (!text) continue
    const ref = text.match(SEE_REF)
    if (ref) {
      see = ref[1]
      break
    }
    if (parts.length >= 3) break
    parts.push(text)
  }
  return { title: parts.join(' ').replace(/\s+/g, ' ').trim(), see }
}

function score(form) {
  let confidence = 1
  const reasons = []
  if (form.ocrPages.length) {
    confidence -= 0.3
    reasons.push('title recovered by OCR')
  }
  if (!form.see) {
    confidence -= 0.2
    reasons.push('no "See section" reference found under the title')
  }
  if (form.title.length < 8) {
    confidence -= 0.3
    reasons.push('title looks too short')
  }
  if (form.title.length > 120) {
    confidence -= 0.1
    reasons.push('title looks too long, may have swallowed body text')
  }
  return { confidence: Math.max(0, Number(confidence.toFixed(2))), reasons }
}

export async function findForms(pdfPath, from, to) {
  const { pages } = await extractRange(pdfPath, from, to)
  const found = []

  for (const page of pages) {
    let lines = page.bodyLines
    const ocrPages = []

    // no usable text layer, fall back to OCR for this page
    if (lines.length < 3) {
      const text = await ocrPage(pdfPath, page.pageNumber)
      if (text) {
        ocrPages.push(page.pageNumber)
        lines = text.split('\n').map((t) => ({ text: t.trim() }))
      }
    }

    const idx = lines.findIndex((l) => FORM_HEADER.test(l.text))
    if (idx === -1) continue

    const number = lines[idx].text.match(FORM_HEADER)[1]
    const { title, see } = readTitle(lines, idx)
    found.push({ number, title, see, startPage: page.pageNumber, ocrPages })
  }

  // a form runs until the next one starts, which is how multi page forms stay whole
  return found.map((form, i) => ({
    ...form,
    endPage: i + 1 < found.length ? found[i + 1].startPage - 1 : to,
  }))
}

export async function extractForms({ pdfPath, outDir, from, to, sourceUri, log = () => {} }) {
  const forms = await findForms(pdfPath, from, to)
  fs.mkdirSync(outDir, { recursive: true })

  const source = await PDFDocument.load(fs.readFileSync(pdfPath))
  const entries = []

  for (const form of forms) {
    const out = await PDFDocument.create()
    const indices = []
    for (let p = form.startPage; p <= form.endPage; p++) indices.push(p - 1)
    const copied = await out.copyPages(source, indices)
    copied.forEach((p) => out.addPage(p))

    out.setTitle(form.title)
    out.setSubject(form.see ? `See section ${form.see}` : '')
    out.setProducer('nyaya forms extractor')
    out.setCreator('nyaya')
    out.setCreationDate(FIXED_DATE)
    out.setModificationDate(FIXED_DATE)

    const bytes = await out.save({ useObjectStreams: false })
    const filename = formFilename(form.number, form.title)
    fs.writeFileSync(path.join(outDir, filename), bytes)

    const { confidence, reasons } = score(form)
    entries.push({
      form_number: Number(form.number),
      title: form.title,
      see_section: form.see,
      page_start: form.startPage,
      page_end: form.endPage,
      page_count: form.endPage - form.startPage + 1,
      filename,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      ocr_pages: form.ocrPages,
      extraction_confidence: confidence,
      needs_review: confidence < 0.9,
      review_reasons: reasons,
    })
    log(`form ${form.number} pages ${form.startPage}-${form.endPage} -> ${filename}`)
  }

  const manifest = {
    act: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
    source_uri: sourceUri,
    source_sha256: crypto.createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex'),
    page_range: [from, to],
    form_count: entries.length,
    forms: entries.sort((a, b) => a.form_number - b.form_number),
  }

  const manifestPath = path.join(outDir, 'forms_manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return { manifest, manifestPath }
}
