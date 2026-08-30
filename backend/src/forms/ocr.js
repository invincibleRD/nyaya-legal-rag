import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWorker } from 'tesseract.js'
import { logger } from '../core/logger.js'
import { config } from '../core/config.js'

const run = promisify(execFile)

// tesseract drops its ~15MB language file in the cwd otherwise
const CACHE_DIR = path.join(config.corpus.dataDir, 'tesseract')

// pages in this act all carry a text layer, so this is a safety net rather than
// a hot path. rasterise with poppler, then read it with tesseract.
export async function ocrPage(pdfPath, pageNumber) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyaya-ocr-'))
  const prefix = path.join(dir, 'page')
  try {
    await run('pdftoppm', [
      '-f',
      String(pageNumber),
      '-l',
      String(pageNumber),
      '-r',
      '300',
      '-png',
      pdfPath,
      prefix,
    ])
    const file = fs.readdirSync(dir).find((f) => f.endsWith('.png'))
    if (!file) return null

    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const worker = await createWorker('eng', 1, { cachePath: CACHE_DIR })
    try {
      const { data } = await worker.recognize(path.join(dir, file))
      logger.warn({ page: pageNumber }, 'used OCR fallback, page had no usable text layer')
      return data.text
    } finally {
      await worker.terminate()
    }
  } catch (err) {
    logger.error({ page: pageNumber, err: err.message }, 'OCR fallback failed')
    return null
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
