import { describe, it, expect } from 'vitest'
import { tokenize } from '../src/retrieval/tokenize.js'
import { buildStats, encodeDocument, encodeQuery, idf, termId } from '../src/retrieval/bm25.js'

describe('tokenize', () => {
  it('keeps section numbers, which is the whole point for statute search', () => {
    expect(tokenize('What is section 103 BNSS?')).toEqual(['section', '103', 'bnss'])
  })

  it('splits s.63 into usable tokens and drops the bare letter', () => {
    expect(tokenize('BNSS s.63(1)')).toEqual(['bnss', '63', '1'])
  })

  it('drops question words so they cannot outweigh the section number', () => {
    expect(tokenize('What is the punishment')).toEqual(['punishment'])
  })

  it('drops stopwords', () => {
    expect(tokenize('the accused shall be in the court')).toEqual(['accused', 'court'])
  })
})

describe('bm25', () => {
  const docs = [
    'summons to an accused person',
    'warrant of arrest for the accused',
    'bond and bail bond after arrest',
    'maintenance of wives and children',
  ]
  const stats = buildStats(docs)

  it('counts documents and average length', () => {
    expect(stats.count).toBe(4)
    expect(stats.avgLength).toBeGreaterThan(0)
    expect(stats.df.accused).toBe(2)
    expect(stats.df.arrest).toBe(2)
  })

  it('gives a rare term more idf than a common one', () => {
    expect(idf(stats, 'maintenance')).toBeGreaterThan(idf(stats, 'accused'))
  })

  it('still scores a term it has never seen', () => {
    expect(idf(stats, 'cognizable')).toBeGreaterThan(0)
  })

  it('scores a matching document above a non matching one', () => {
    const q = encodeQuery('warrant of arrest', stats)
    const score = (text) => {
      const d = encodeDocument(text, stats)
      let total = 0
      q.indices.forEach((idx, i) => {
        const at = d.indices.indexOf(idx)
        if (at !== -1) total += q.values[i] * d.values[at]
      })
      return total
    }
    expect(score(docs[1])).toBeGreaterThan(score(docs[3]))
  })

  it('hashes a term to the same slot every time', () => {
    expect(termId('arrest')).toBe(termId('arrest'))
    expect(termId('arrest')).not.toBe(termId('warrant'))
    expect(termId('arrest')).toBeGreaterThanOrEqual(0)
  })
})
