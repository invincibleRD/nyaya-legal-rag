import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { toBlocks, findReferences, chunkSection, collectSections } from '../src/ingestion/chunker.js'

const line = (text, page = 1) => ({ text, page })

describe('toBlocks', () => {
  it('keeps a proviso attached to the subsection it qualifies', () => {
    const blocks = toBlocks(
      '(1) The Court may grant bail to the accused. Provided that no bail shall be granted where the offence is punishable with death. (2) The Court shall record reasons.'
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toContain('Provided that no bail')
    expect(blocks[1].label).toBe('(2)')
  })

  it('keeps explanations, exceptions and illustrations with their parent', () => {
    const blocks = toBlocks(
      '(1) Whoever does the thing shall be punished. Explanation.—In this section "thing" means anything. Illustration. A does the thing.'
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toContain('Explanation')
    expect(blocks[0].text).toContain('Illustration')
  })

  it('does not treat a bracketed number mid-sentence as a subsection break', () => {
    const blocks = toBlocks('(1) A person referred to in clause (2) of the said order shall comply.')
    expect(blocks).toHaveLength(1)
  })
})

describe('findReferences', () => {
  it('picks up cross references to other sections', () => {
    expect(findReferences('as defined in section 2 and under sections 35 or 63')).toEqual([
      '2',
      '35',
      '63',
    ])
  })

  it('returns nothing when the text cites no section', () => {
    expect(findReferences('The Court shall record its reasons in writing.')).toEqual([])
  })
})

describe('chunkSection', () => {
  const meta = { sourceUri: 'test://bnss', ingestedAt: '2026-01-01T00:00:00.000Z' }

  it('never splits a section that fits inside one chunk', () => {
    const section = {
      number: '63',
      chapter: 'VI',
      chapterTitle: 'Processes To Compel Appearance',
      title: 'Form of summons',
      pageStart: 20,
      pageEnd: 20,
      lines: [line('Every summons issued by a Court under this Sanhita shall be in writing.')],
    }
    const chunks = chunkSection(section, meta)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].chunk_id).toBe('bnss-s63-001')
    expect(chunks[0].subsection).toBeNull()
    expect(chunks[0].embed_text).toContain('BNSS Section 63 - Form of summons')
  })

  it('heals a word hyphenated across a line break', () => {
    const section = {
      number: '5',
      chapter: 'I',
      chapterTitle: 'Preliminary',
      title: 'Saving',
      pageStart: 3,
      pageEnd: 3,
      lines: [line('The accused shall not be pro-'), line('secuted twice for the same offence.')],
    }
    expect(chunkSection(section, meta)[0].text).toContain('prosecuted twice')
  })

  it('splits a long section at subsection boundaries, not mid-sentence', () => {
    const body = (n) =>
      `(${n}) ` + `The Magistrate shall consider the application on its merits. `.repeat(20)
    const section = {
      number: '144',
      chapter: 'X',
      chapterTitle: 'Order For Maintenance',
      title: 'Order for maintenance of wives, children and parents',
      pageStart: 42,
      pageEnd: 43,
      lines: [line(body(1), 42), line(body(2), 43)],
    }
    const chunks = chunkSection(section, meta)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.text.length <= 1800)).toBe(true)
    expect(chunks[0].text.startsWith('(1)')).toBe(true)
    expect(chunks[1].text.startsWith('(2)')).toBe(true)
    // page range is per chunk, not copied from the section
    expect(chunks[0].page_start).toBe(42)
    expect(chunks[1].page_end).toBe(43)
  })

  it('flags structural features on the chunk', () => {
    const section = {
      number: '2',
      chapter: 'I',
      chapterTitle: 'Preliminary',
      title: 'Definitions',
      pageStart: 2,
      pageEnd: 2,
      lines: [line('(1) Bail means release. Provided that conditions may apply. Explanation.—Here.')],
    }
    const c = chunkSection(section, meta)[0]
    expect(c.has_proviso).toBe(true)
    expect(c.has_explanation).toBe(true)
    expect(c.has_illustration).toBe(false)
    expect(c.act_short).toBe('BNSS')
  })
})

describe('collectSections', () => {
  it('ignores a section number quoted mid-sentence and only takes the next in sequence', () => {
    const pages = [
      {
        pageNumber: 1,
        bodyLines: [
          { y: 700, x: 142, text: '1. (1) This Act may be called the Sanhita.' },
          { y: 680, x: 118, text: 'nothing in section 136 shall apply to it.' },
          { y: 660, x: 142, text: '2. (1) In this Sanhita, unless the context otherwise requires,—' },
        ],
        marginBlocks: [
          { topY: 700, text: 'Short title. Definitions.' },
        ],
      },
    ]
    const sections = collectSections(pages)
    expect(sections.map((s) => s.number)).toEqual(['1', '2'])
    expect(sections[0].title).toBe('Short title')
    expect(sections[1].title).toBe('Definitions')
  })
})

// The bare act is not in the repo (data/raw is gitignored), so this only runs
// where the corpus has actually been fetched.
const CORPUS = new URL('../../data/raw/bnss-2023.pdf', import.meta.url).pathname
describe.runIf(fs.existsSync(CORPUS))('the real bare act', () => {
  it('parses all 531 sections with a title and a chapter', async () => {
    const { buildStatuteChunks } = await import('../src/ingestion/chunker.js')
    const { sections, chunks } = await buildStatuteChunks(CORPUS, { sourceUri: 'test' })
    expect(sections).toHaveLength(531)
    expect(sections.filter((s) => !s.title)).toHaveLength(0)
    expect(sections.filter((s) => !s.chapter)).toHaveLength(0)
    expect(chunks.every((c) => c.text.length <= 1800)).toBe(true)
  }, 60000)
})
