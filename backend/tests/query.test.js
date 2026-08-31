import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }))

vi.mock('../src/llm/provider.js', () => ({
  getProvider: () => ({ complete, fastModel: 'fast-lite' }),
}))
vi.mock('../src/core/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }))

const { transformQuery, detectSectionIntent } = await import('../src/retrieval/query.js')

const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in unit tests')))

beforeEach(() => {
  complete.mockReset()
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const triageReply = (intent, passage) => ({ text: JSON.stringify({ intent, passage }) })

describe('detectSectionIntent', () => {
  it('reads a section out of a plain question', () => {
    expect(detectSectionIntent('what is section 103 BNSS?')).toEqual({
      number: '103',
      subsection: null,
      act: 'BNSS',
    })
  })

  it('handles the s.63 shorthand', () => {
    expect(detectSectionIntent('s.63')).toEqual({ number: '63', subsection: null, act: null })
  })

  it('handles the act followed by a bare number', () => {
    expect(detectSectionIntent('BNSS 103')).toEqual({
      number: '103',
      subsection: null,
      act: 'BNSS',
    })
  })

  it('keeps the subsection', () => {
    expect(detectSectionIntent('section 35(3)')).toEqual({
      number: '35',
      subsection: '(3)',
      act: null,
    })
  })

  it('remembers which act was named, the schedule holds BNS sections too', () => {
    expect(detectSectionIntent('is BNS section 351 bailable')?.act).toBe('BNS')
    expect(detectSectionIntent('is section 351 bailable')?.act).toBeNull()
  })

  it('handles sec. and u/s', () => {
    expect(detectSectionIntent('under sec. 41 of the sanhita')?.number).toBe('41')
    expect(detectSectionIntent('u/s 187 the police may apply')?.number).toBe('187')
  })

  it('does not read the act year as a section', () => {
    expect(detectSectionIntent('the BNSS 2023 came into force last year')).toBeNull()
  })

  it('returns null for questions with no section marker', () => {
    expect(detectSectionIntent('what is bail?')).toBeNull()
    expect(detectSectionIntent('explain the procedure for arrest without a warrant')).toBeNull()
    expect(detectSectionIntent('the accused was 35 years old')).toBeNull()
    expect(detectSectionIntent('')).toBeNull()
  })
})

describe('transformQuery', () => {
  it('does not call the model at all for a first turn section lookup', async () => {
    const out = await transformQuery({ message: 'what is section 103 BNSS?', history: [] })

    expect(out.intent).toBe('section_lookup')
    expect(out.hyde).toBeNull()
    expect(out.standalone).toBe('what is section 103 BNSS?')
    expect(out.search).toBe('what is section 103 BNSS?')
    expect(complete).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips the rewrite when there is no history', async () => {
    complete.mockResolvedValueOnce(triageReply('concept', 'A police officer may arrest.'))

    const out = await transformQuery({ message: 'when can police arrest without a warrant?' })

    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0][0].model).toBe('fast-lite')
    expect(out.standalone).toBe('when can police arrest without a warrant?')
    expect(out.intent).toBe('concept')
    expect(out.hyde).toBe('A police officer may arrest.')
  })

  it('resolves a follow-up against history and then detects the section itself', async () => {
    complete.mockResolvedValueOnce({ text: 'what is the proviso to section 35 BNSS?' })

    const out = await transformQuery({
      message: 'what about its proviso?',
      history: [
        { role: 'user', content: 'what is section 35 BNSS?' },
        { role: 'assistant', content: 'Section 35 deals with arrest without a warrant.' },
      ],
    })

    expect(out.standalone).toBe('what is the proviso to section 35 BNSS?')
    expect(out.intent).toBe('section_lookup')
    expect(out.hyde).toBeNull()
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('passes the conversation and the new message to the rewrite', async () => {
    complete.mockResolvedValueOnce({ text: 'what is the proviso to section 35 BNSS?' })

    await transformQuery({
      message: 'what about its proviso?',
      history: [{ role: 'user', content: 'what is section 35 BNSS?' }],
    })

    const { messages, model } = complete.mock.calls[0][0]
    expect(model).toBe('fast-lite')
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ role: 'user', content: 'what is section 35 BNSS?' })
    expect(messages[1]).toEqual({ role: 'user', content: 'what about its proviso?' })
  })

  it('keeps both the raw message and the rewrite in the sparse query, and no hyde', async () => {
    complete
      .mockResolvedValueOnce({ text: 'what is the punishment for breaching a bond?' })
      .mockResolvedValueOnce(triageReply('concept', 'Where a bond is breached the Court may.'))

    const out = await transformQuery({
      message: 'and the punishment?',
      history: [{ role: 'user', content: 'what is a bond under the BNSS?' }],
    })

    expect(out.search).toBe('and the punishment? what is the punishment for breaching a bond?')
    expect(out.search).not.toContain('Where a bond is breached')
  })

  it('drops hyde for an out of scope question', async () => {
    complete.mockResolvedValueOnce(triageReply('out_of_scope', 'ignored'))

    const out = await transformQuery({ message: 'what is the weather in Pune?' })

    expect(out.intent).toBe('out_of_scope')
    expect(out.hyde).toBeNull()
  })

  it('carries the document intent through', async () => {
    complete.mockResolvedValueOnce(triageReply('document', 'The agreement provides that.'))

    const out = await transformQuery({ message: 'what does the pdf I uploaded say about notice?' })

    expect(out.intent).toBe('document')
    expect(out.hyde).toBe('The agreement provides that.')
  })

  it('falls back to the raw message when the rewrite call fails', async () => {
    complete
      .mockRejectedValueOnce(new Error('502 upstream'))
      .mockResolvedValueOnce(triageReply('concept', 'The Magistrate may.'))

    const out = await transformQuery({
      message: 'what about its proviso?',
      history: [{ role: 'user', content: 'what is section 35 BNSS?' }],
    })

    expect(out.standalone).toBe('what about its proviso?')
    expect(out.search).toBe('what about its proviso?')
    expect(out.intent).toBe('concept')
  })

  it('falls back to a concept question when triage fails', async () => {
    complete.mockRejectedValueOnce(new Error('timeout'))

    const out = await transformQuery({ message: 'how does anticipatory bail work?' })

    expect(out.intent).toBe('concept')
    expect(out.hyde).toBeNull()
    expect(out.search).toBe('how does anticipatory bail work?')
  })

  it('survives triage output that is not json', async () => {
    complete.mockResolvedValueOnce({ text: 'Sure! Here is what I think.' })

    const out = await transformQuery({ message: 'how does anticipatory bail work?' })

    expect(out.intent).toBe('concept')
    expect(out.hyde).toBeNull()
  })

  it('reads json out of a fenced reply and an unknown intent label', async () => {
    complete.mockResolvedValueOnce({
      text: '```json\n{"intent": "statute", "passage": "The Court shall release the accused."}\n```',
    })

    const out = await transformQuery({ message: 'how does anticipatory bail work?' })

    expect(out.intent).toBe('concept')
    expect(out.hyde).toBe('The Court shall release the accused.')
  })

  it('strips quotes and stray commentary from the rewrite', async () => {
    complete
      .mockResolvedValueOnce({ text: '"what is a bail bond under the BNSS?"\nHope that helps.' })
      .mockResolvedValueOnce(triageReply('concept', 'Every person released on bail shall.'))

    const out = await transformQuery({
      message: 'and that?',
      history: [{ role: 'user', content: 'what is bail?' }],
    })

    expect(out.standalone).toBe('what is a bail bond under the BNSS?')
  })

  it('keeps the raw message when the rewrite comes back empty', async () => {
    complete
      .mockResolvedValueOnce({ text: '   ' })
      .mockResolvedValueOnce(triageReply('concept', 'The officer shall.'))

    const out = await transformQuery({
      message: 'and that?',
      history: [{ role: 'user', content: 'what is bail?' }],
    })

    expect(out.standalone).toBe('and that?')
  })

  it('never throws on an empty message', async () => {
    complete.mockResolvedValueOnce(triageReply('out_of_scope', ''))

    const out = await transformQuery({ message: '' })

    expect(out).toEqual({ search: '', hyde: null, standalone: '', intent: 'out_of_scope' })
  })
})
