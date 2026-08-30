import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const CORPUS = new URL('../../data/raw/bnss-2023.pdf', import.meta.url).pathname

describe.runIf(fs.existsSync(CORPUS))('forms parser against the real schedule', () => {
  it('scrapes the title printed under the form number, including wrapped titles', async () => {
    const { findForms } = await import('../src/forms/extract.js')
    const forms = await findForms(CORPUS, 190, 199)

    const first = forms.find((f) => f.number === '1')
    expect(first.title).toBe('NOTICE FOR APPEARANCE BY THE POLICE')
    expect(first.see).toBe('35(3)')

    // this one wraps onto a second line before the "See section" reference
    const nine = forms.find((f) => f.number === '9')
    expect(nine.title).toBe(
      'ORDER AUTHORISING AN ATTACHMENT BY THE DISTRICT MAGISTRATE OR COLLECTOR'
    )
  }, 30000)

  it('keeps a form that runs over three pages as one range', async () => {
    const { findForms } = await import('../src/forms/extract.js')
    const forms = await findForms(CORPUS, 220, 226)
    const charges = forms.find((f) => f.number === '33')
    expect(charges.startPage).toBe(222)
    expect(charges.endPage).toBe(224)
  }, 30000)

  it('writes byte identical output when run twice', async () => {
    const { extractForms } = await import('../src/forms/extract.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyaya-forms-test-'))
    try {
      const opts = { pdfPath: CORPUS, outDir: dir, from: 190, to: 193, sourceUri: 'test' }
      const first = await extractForms(opts)
      const before = fs.readdirSync(dir).sort()
      const second = await extractForms(opts)

      expect(fs.readdirSync(dir).sort()).toEqual(before)
      expect(second.manifest.forms.map((f) => f.sha256)).toEqual(
        first.manifest.forms.map((f) => f.sha256)
      )
      expect(first.manifest.forms[0].filename).toMatch(/^FORM-1_/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)
})
