import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const conversations = new Map()
const messages = new Map()

vi.mock('../src/core/store.js', () => ({
  createConversation: vi.fn(async (sessionId, title) => {
    const conv = { id: 'conv-1', session_id: sessionId, title }
    conversations.set(conv.id, conv)
    return conv
  }),
  getConversation: vi.fn(async (id, sessionId) => {
    const conv = conversations.get(id)
    return conv && conv.session_id === sessionId ? conv : null
  }),
  listConversations: vi.fn(async (sessionId) =>
    [...conversations.values()].filter((c) => c.session_id === sessionId)
  ),
  renameConversation: vi.fn(async (id, sessionId, title) => {
    const conv = conversations.get(id)
    if (!conv || conv.session_id !== sessionId) return null
    conv.title = title
    return conv
  }),
  deleteConversation: vi.fn(async (id, sessionId) => {
    const conv = conversations.get(id)
    if (!conv || conv.session_id !== sessionId) return false
    conversations.delete(id)
    return true
  }),
  addMessage: vi.fn(async (id, m) => {
    messages.set(id, [...(messages.get(id) || []), m])
    return m
  }),
  getMessages: vi.fn(async (id) => messages.get(id) || []),
}))

vi.mock('../src/llm/answer.js', () => ({
  answerStream: vi.fn(async function* () {
    yield { type: 'meta', conversation_id: 'conv-1', route: 'statute' }
    yield { type: 'token', text: 'Section 43(5) applies [BNSS s.43(5)].' }
    yield { type: 'citations', citations: [{ marker: '[BNSS s.43(5)]', section_number: '43' }] }
    yield { type: 'done', refused: false, usage: { input_tokens: 10, output_tokens: 5 } }
  }),
}))

vi.mock('../src/retrieval/hybrid.js', () => ({
  retrieve: vi.fn(async () => ({ results: [], route: 'statute', took_ms: 1 })),
}))

const { createApp } = await import('../src/app.js')
const app = createApp()
const SESSION = 'session-abcdef12'

beforeEach(() => {
  conversations.clear()
  messages.clear()
})

describe('health', () => {
  it('reports liveness', async () => {
    const res = await request(app).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('exposes prometheus metrics', async () => {
    const res = await request(app).get('/api/v1/metrics')
    expect(res.status).toBe(200)
    expect(res.text).toContain('nyaya_http_requests_total')
  })
})

describe('POST /chat', () => {
  it('rejects an empty message', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set('x-session-id', SESSION)
      .send({ message: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('validation_error')
  })

  it('rejects a message past the length cap', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set('x-session-id', SESSION)
      .send({ message: 'x'.repeat(4001) })
    expect(res.status).toBe(400)
  })

  it('streams sse events in order', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .set('x-session-id', SESSION)
      .send({ message: 'can a woman be arrested at night' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.text).toContain('event: meta')
    expect(res.text).toContain('event: token')
    expect(res.text).toContain('event: citations')
    expect(res.text).toContain('event: done')
    expect(res.text.indexOf('event: meta')).toBeLessThan(res.text.indexOf('event: done'))
  })

  it('persists both turns of the exchange', async () => {
    await request(app).post('/api/v1/chat').set('x-session-id', SESSION).send({ message: 'hello' })
    expect(messages.get('conv-1').map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('404s on a conversation belonging to someone else', async () => {
    conversations.set('conv-9', { id: 'conv-9', session_id: 'someone-else-01', title: 't' })
    const res = await request(app)
      .post('/api/v1/chat')
      .set('x-session-id', SESSION)
      .send({ message: 'hi', conversation_id: 'conv-9' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('not_found')
  })
})

describe('conversations', () => {
  const seed = () =>
    conversations.set('conv-1', { id: 'conv-1', session_id: SESSION, title: 'old' })

  it('lists only this session', async () => {
    seed()
    conversations.set('conv-2', { id: 'conv-2', session_id: 'other-session1', title: 'theirs' })
    const res = await request(app).get('/api/v1/conversations').set('x-session-id', SESSION)
    expect(res.body.conversations).toHaveLength(1)
  })

  it('renames', async () => {
    seed()
    const res = await request(app)
      .patch('/api/v1/conversations/conv-1')
      .set('x-session-id', SESSION)
      .send({ title: 'new name' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('new name')
  })

  it('rejects a rename with no title', async () => {
    seed()
    const res = await request(app)
      .patch('/api/v1/conversations/conv-1')
      .set('x-session-id', SESSION)
      .send({})
    expect(res.status).toBe(400)
  })

  it('deletes', async () => {
    seed()
    const res = await request(app)
      .delete('/api/v1/conversations/conv-1')
      .set('x-session-id', SESSION)
    expect(res.status).toBe(204)
    expect(conversations.has('conv-1')).toBe(false)
  })

  it("will not delete someone else's", async () => {
    conversations.set('conv-3', { id: 'conv-3', session_id: 'not-you-abcd', title: 'x' })
    const res = await request(app)
      .delete('/api/v1/conversations/conv-3')
      .set('x-session-id', SESSION)
    expect(res.status).toBe(404)
    expect(conversations.has('conv-3')).toBe(true)
  })
})

describe('POST /search', () => {
  it('rejects a missing query', async () => {
    const res = await request(app).post('/api/v1/search').set('x-session-id', SESSION).send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('validation_error')
  })

  it('rejects a top_k outside the allowed range', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('x-session-id', SESSION)
      .send({ query: 'bail', top_k: 500 })
    expect(res.status).toBe(400)
  })

  it('answers a valid query', async () => {
    const res = await request(app)
      .post('/api/v1/search')
      .set('x-session-id', SESSION)
      .send({ query: 'bail' })
    expect(res.status).toBe(200)
    expect(res.body.route).toBe('statute')
  })
})

describe('unknown routes', () => {
  it('404s with a json body', async () => {
    const res = await request(app).get('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('not_found')
  })
})
