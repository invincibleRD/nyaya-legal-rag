import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import archiver from 'archiver'
import { config } from '../core/config.js'

export const forms = Router()

const formsDir = () => path.join(config.corpus.dataDir, 'forms')
const manifestPath = () => path.join(formsDir(), 'forms_manifest.json')

function readManifest() {
  if (!fs.existsSync(manifestPath())) return null
  return JSON.parse(fs.readFileSync(manifestPath(), 'utf8'))
}

function publicForm(f) {
  return {
    form_number: f.form_number,
    title: f.title,
    see_section: f.see_section,
    page_start: f.page_start,
    page_end: f.page_end,
    page_count: f.page_count,
    filename: f.filename,
    bytes: f.bytes,
    needs_review: f.needs_review,
  }
}

function requireManifest(res) {
  const manifest = readManifest()
  if (!manifest) {
    res.status(503).json({
      error: 'upstream_unavailable',
      message: 'forms have not been extracted yet, run scripts/extract-forms.js',
    })
    return null
  }
  return manifest
}

forms.get('/forms', (_req, res) => {
  const manifest = requireManifest(res)
  if (!manifest) return
  res.json({ forms: manifest.forms.map(publicForm), count: manifest.form_count })
})

forms.get('/forms/search', (req, res) => {
  const manifest = requireManifest(res)
  if (!manifest) return
  const q = String(req.query.q || '')
    .toLowerCase()
    .trim()
  const hits = q
    ? manifest.forms.filter((f) => f.title.toLowerCase().includes(q) || String(f.form_number) === q)
    : manifest.forms
  res.json({ forms: hits.map(publicForm), count: hits.length, query: q })
})

// must come after /forms/search so the literal route wins
forms.get('/forms/download-all', (_req, res) => {
  const manifest = requireManifest(res)
  if (!manifest) return

  res.setHeader('content-type', 'application/zip')
  res.setHeader('content-disposition', 'attachment; filename="bnss-forms.zip"')

  const zip = archiver('zip', { zlib: { level: 9 } })
  zip.on('error', () => res.destroy())
  zip.pipe(res)
  for (const f of manifest.forms) {
    const file = path.join(formsDir(), f.filename)
    if (fs.existsSync(file)) zip.file(file, { name: f.filename })
  }
  zip.append(JSON.stringify(manifest, null, 2), { name: 'forms_manifest.json' })
  zip.finalize()
})

forms.get('/forms/:number/download', (req, res) => {
  const manifest = requireManifest(res)
  if (!manifest) return

  const form = manifest.forms.find((f) => String(f.form_number) === String(req.params.number))
  if (!form) return res.status(404).json({ error: 'not_found', message: 'no such form' })

  const file = path.join(formsDir(), form.filename)
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'not_found', message: 'form file is missing on disk' })
  }
  res.setHeader('content-type', 'application/pdf')
  res.setHeader('content-disposition', `attachment; filename="${form.filename}"`)
  fs.createReadStream(file).pipe(res)
})
