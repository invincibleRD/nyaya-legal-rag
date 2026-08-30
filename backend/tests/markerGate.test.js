import { describe, it, expect } from 'vitest'
import { createMarkerGate } from '../src/llm/markerGate.js'
import { makeMarkerChecker } from '../src/llm/guards/output.js'

const contexts = [
  { section_number: '103', subsection: '(1)', act_short: 'BNSS', text: 'x', page_start: 30 },
]

// feed the text one character at a time, the worst case for a buffering gate
const drip = (gate, text) => {
  let out = ''
  for (const ch of text) out += gate.push(ch)
  return out + gate.flush()
}

describe('createMarkerGate', () => {
  const gate = () => createMarkerGate(makeMarkerChecker(contexts))

  it('never emits an invented citation, even split across chunks', () => {
    expect(drip(gate(), 'You must comply [BNSS s.999] today.')).toBe('You must comply  today.')
  })

  it('keeps a real citation and normalises it', () => {
    expect(drip(gate(), 'See [BNSS s. 103 ] here.')).toBe('See [BNSS s.103] here.')
  })

  it('passes ordinary text through untouched', () => {
    expect(drip(gate(), 'No citations in this sentence at all.')).toBe(
      'No citations in this sentence at all.'
    )
  })

  it('does not hold back text that has no bracket', () => {
    const g = gate()
    expect(g.push('The Court ')).toBe('The Court ')
  })

  it('holds a partial marker until the bracket closes', () => {
    const g = gate()
    expect(g.push('See [BNSS s.1')).toBe('See ')
    expect(g.push('03] now')).toBe('[BNSS s.103] now')
  })

  it('drops a citation the model was cut off mid-way through', () => {
    const g = gate()
    g.push('Under [BNSS s.10')
    expect(g.flush()).toBe('')
  })

  it('keeps a stray bracket that is not a citation', () => {
    expect(drip(gate(), 'an array [x] and a note [see below]')).toBe(
      'an array [x] and a note [see below]'
    )
  })

  it('handles several markers in one stream', () => {
    expect(drip(gate(), 'a [BNSS s.103] b [BNSS s.999] c')).toBe('a [BNSS s.103] b  c')
  })
})
