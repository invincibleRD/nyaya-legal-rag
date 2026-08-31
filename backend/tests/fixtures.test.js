import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { makeStatutePdf } from './fixtures/makePdf.js'
import { extractRange } from '../src/ingestion/pdfText.js'
import { collectSections, chunkSection } from '../src/ingestion/chunker.js'

// runs everywhere, including CI, because the fixture is generated not downloaded
describe('parsing a statute page', () => {
  let dir
  let pdfPath

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyaya-fixture-'))
    pdfPath = path.join(dir, 'fixture.pdf')
    fs.writeFileSync(pdfPath, await makeStatutePdf())
  })

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('separates the marginal notes from the body and drops the header', async () => {
    const { pages } = await extractRange(pdfPath, 1, 1)
    const [page] = pages

    expect(page.marginBlocks.map((b) => b.text)).toEqual([
      'Form of summons.',
      'Summons how served.',
    ])
    expect(page.bodyLines.some((l) => l.text.includes('GAZETTE'))).toBe(false)
    expect(page.bodyLines.some((l) => l.text.startsWith('1.'))).toBe(true)
  })

  it('cuts the page into sections and titles them from the margin', async () => {
    const { pages } = await extractRange(pdfPath, 1, 1)
    const sections = collectSections(pages)

    expect(sections.map((s) => s.number)).toEqual(['1', '2'])
    expect(sections[0].title).toBe('Form of summons')
    expect(sections[1].title).toBe('Summons how served')
    expect(sections[0].chapter).toBe('VI')
    expect(sections[0].chapterTitle).toBe('Processes To Compel Appearance')
  })

  it('keeps the proviso with its section and records the cross reference', async () => {
    const { pages } = await extractRange(pdfPath, 1, 1)
    const [first, second] = collectSections(pages)

    const [chunk] = chunkSection(first, { sourceUri: 'test', ingestedAt: 'now' })
    expect(chunk.has_proviso).toBe(true)
    expect(chunk.text).toContain('Provided that')
    expect(chunk.embed_text).toContain('BNSS Section 1 - Form of summons')

    const [next] = chunkSection(second, { sourceUri: 'test', ingestedAt: 'now' })
    expect(next.references).toContain('63')
  })
})
