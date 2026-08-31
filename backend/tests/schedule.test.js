import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { rowsFromPage, collectEntries } from '../src/ingestion/schedule.js'

const CHAR = 3.4
const run = (x, y, str, width = str.length * CHAR) => ({ x, y, width, height: 8, str })

// every page of the table repeats the column numbers, the rows start under them
const numbering = [67, 136, 235, 319, 401, 490].map((x, i) => run(x, 747, String(i + 1), 4))

describe('rowsFromPage', () => {
  it('cuts a run that the typesetter ran across two columns', () => {
    const spill = 'If the abettor or the person Imprisonment extending'
    const runs = [
      ...numbering,
      run(93.6, 700, spill, 192.5 - 93.6 + 'Imprisonment extending'.length * CHAR),
    ]
    const [first] = rowsFromPage(runs, 159)
    expect(first.cells.offence).toBe('If the abettor or the person')
    expect(first.cells.punishment).toBe('Imprisonment extending')
  })

  it('stops at part II, which classifies offences under other acts', () => {
    const runs = [
      ...numbering,
      run(57.6, 700, '4 9', 8.9),
      run(93.6, 700, 'Abetment.'),
      run(178.4, 500, 'II.—CLASSIFICATION OF OFFENCES AGAINST OTHER LAWS'),
      run(56.5, 400, 'If punishable with death.'),
    ]
    expect(rowsFromPage(runs, 189)).toHaveLength(1)
  })
})

describe('collectEntries', () => {
  it('opens an entry per section and keeps the rows printed under it', () => {
    const row = (section, offence) => ({ page: 160, cells: { section, offence } })
    const entries = collectEntries([
      row('64(1)', 'Rape.'),
      row('', 'Rape by a police officer.'),
      row('111(2)(a', ') Organised crime resulting in death.'),
    ])

    expect(entries).toHaveLength(2)
    expect(entries[0].number).toBe('64')
    expect(entries[0].rows).toHaveLength(2)
    // the closing bracket gets typeset into the next column
    expect(entries[1].subsection).toBe('(2)(a)')
    expect(entries[1].rows[0].offence).toBe('Organised crime resulting in death.')
  })
})

const CORPUS = new URL('../../data/raw/bnss-2023.pdf', import.meta.url).pathname
describe.runIf(fs.existsSync(CORPUS))('the real first schedule', () => {
  it('reads every classified offence off pages 158 to 189', async () => {
    const { buildScheduleChunks } = await import('../src/ingestion/schedule.js')
    const { entries, chunks } = await buildScheduleChunks(CORPUS, { sourceUri: 'test' })

    expect(entries.length).toBeGreaterThan(360)
    expect(chunks.every((c) => c.text.length <= 1800)).toBe(true)

    // sections are printed in order, a jump backwards means a row went astray
    const numbers = entries.map((e) => Number(e.number))
    expect(numbers.every((n, i) => i === 0 || n >= numbers[i - 1])).toBe(true)

    const [intimidation] = chunks.filter((c) => c.section_number === '351')
    expect(intimidation.act_short).toBe('BNS')
    expect(intimidation.chapter).toBe('First Schedule')
    expect(intimidation.text).toMatch(/Bailable or non-bailable: Bailable/)
  }, 60000)
})
