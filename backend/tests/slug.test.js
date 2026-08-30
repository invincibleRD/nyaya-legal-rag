import { describe, it, expect } from 'vitest'
import { slugify, toTitleCase, formFilename } from '../src/forms/slug.js'

describe('slugify', () => {
  it('drops apostrophes instead of turning them into separators', () => {
    expect(slugify("MAGISTRATE'S ORDER")).toBe('Magistrates-Order')
  })

  it('collapses commas, periods and runs of punctuation', () => {
    expect(slugify('ORDER PROHIBITING THE REPETITION, ETC., OF A NUISANCE')).toBe(
      'Order-Prohibiting-the-Repetition-etc-of-a-Nuisance'
    )
  })

  it('keeps both halves of a hyphenated word capitalised', () => {
    expect(slugify('BOND AND BAIL-BOND AFTER ARREST')).toBe('Bond-and-Bail-Bond-After-Arrest')
  })

  it('leaves no leading, trailing or doubled separators', () => {
    const s = slugify('  ***WARRANT   OF    ARREST!!!  ')
    expect(s).toBe('Warrant-of-Arrest')
    expect(s.startsWith('-')).toBe(false)
    expect(s.endsWith('-')).toBe(false)
    expect(s).not.toContain('--')
  })

  it('lowercases small words but never the first one', () => {
    expect(toTitleCase('THE BOND FOR THE PEACE')).toBe('The Bond for the Peace')
  })

  it('builds a filesystem safe filename in the required shape', () => {
    const name = formFilename('12', 'BOND AND BAIL-BOND FOR ATTENDANCE BEFORE COURT')
    expect(name).toBe('FORM-12_Bond-and-Bail-Bond-for-Attendance-before-Court.pdf')
    expect(name).not.toMatch(/[\s/\\:*?"<>|]/)
  })
})
