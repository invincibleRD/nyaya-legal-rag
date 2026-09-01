import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const conversations = new Map()
const messages = new Map()
let documents = []

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
  countConversations: vi.fn(
    async (sessionId) =>
      [...conversations.values()].filter((c) => c.session_id === sessionId).length
  ),
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
  listDocuments: vi.fn(async (sessionId) => documents.filter((d) => d.session_id === sessionId)),
  getDocument: vi.fn(async (id, sessionId) => {
    const doc = documents.find((d) => d.id === id)
    return doc && doc.session_id === sessionId ? doc : null
  }),
  countDocuments: vi.fn(
    async (sessionId) => documents.filter((d) => d.session_id === sessionId).length
  ),
  createDocument: vi.fn(async (sessionId, doc) => {
    const record = { id: 'doc-1', session_id: sessionId, status: 'queued', progress: '0', ...doc }
    documents.push(record)
    return record
  }),
  updateDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async (id, sessionId) => {
    const i = documents.findIndex((d) => d.id === id && d.session_id === sessionId)
    return i === -1 ? null : documents.splice(i, 1)[0]
  }),
  saveFeedback: vi.fn(async () => {}),
}))

vi.mock('../src/workers/queue.js', () => ({
  enqueueIngest: vi.fn(async () => 'job-1'),
  ingestQueue: vi.fn(),
}))

vi.mock('../src/ingestion/document.js', () => ({
  purgeDocument: vi.fn(async () => {}),
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
  documents = []
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

  it('serves the openapi spec', async () => {
    const res = await request(app).get('/docs/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toBe('3.0.3')
    expect(Object.keys(res.body.paths)).toContain('/chat')
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

describe('documents', () => {
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n')

  it('accepts a pdf and queues it', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('x-session-id', SESSION)
      .attach('file', pdfBytes, { filename: 'notice.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(202)
    expect(res.body.status).toBe('queued')
    expect(res.body.document_id).toBeTruthy()
    expect(res.body.job_id).toBeTruthy()
  })

  it('rejects a file that only claims to be a pdf', async () => {
    // the header says pdf, the bytes say otherwise
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('x-session-id', SESSION)
      .attach('file', Buffer.from('MZ this is an exe'), {
        filename: 'evil.pdf',
        contentType: 'application/pdf',
      })
    expect(res.status).toBe(415)
    expect(res.body.error).toBe('unsupported_media_type')
  })

  it('rejects a type that is not pdf at all', async () => {
    const res = await request(app)
      .post('/api/v1/documents/upload')
      .set('x-session-id', SESSION)
      .attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
    expect(res.status).toBe(415)
  })

  it('requires a file', async () => {
    const res = await request(app).post('/api/v1/documents/upload').set('x-session-id', SESSION)
    expect(res.status).toBe(400)
  })

  it('lists only this session and reports status', async () => {
    documents.push(
      { id: 'd1', session_id: SESSION, filename: 'mine.pdf', status: 'ready', progress: '1' },
      { id: 'd2', session_id: 'other-session1', filename: 'theirs.pdf', status: 'ready' }
    )
    const list = await request(app).get('/api/v1/documents').set('x-session-id', SESSION)
    expect(list.body.documents.map((d) => d.id)).toEqual(['d1'])

    const status = await request(app)
      .get('/api/v1/documents/d1/status')
      .set('x-session-id', SESSION)
    expect(status.status).toBe(200)
    expect(status.body.status).toBe('ready')
  })

  it("404s on another session's document", async () => {
    documents.push({ id: 'd9', session_id: 'not-you-abcd', filename: 'x.pdf', status: 'ready' })
    const res = await request(app).get('/api/v1/documents/d9/status').set('x-session-id', SESSION)
    expect(res.status).toBe(404)
  })

  it('deletes and purges', async () => {
    documents.push({ id: 'd3', session_id: SESSION, filename: 'gone.pdf', status: 'ready' })
    const res = await request(app).delete('/api/v1/documents/d3').set('x-session-id', SESSION)
    expect(res.status).toBe(204)
    const { purgeDocument } = await import('../src/ingestion/document.js')
    expect(purgeDocument).toHaveBeenCalledWith({ documentId: 'd3', sessionId: SESSION })
  })

  it("will not delete another session's document", async () => {
    documents.push({ id: 'd4', session_id: 'not-you-abcd', filename: 'x.pdf', status: 'ready' })
    const res = await request(app).delete('/api/v1/documents/d4').set('x-session-id', SESSION)
    expect(res.status).toBe(404)
  })
})

describe('feedback', () => {
  it('accepts a rating', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .set('x-session-id', SESSION)
      .send({ conversation_id: 'conv-1', rating: 'up' })
    expect(res.status).toBe(201)
  })

  it('rejects a rating it does not understand', async () => {
    const res = await request(app)
      .post('/api/v1/feedback')
      .set('x-session-id', SESSION)
      .send({ conversation_id: 'conv-1', rating: 'sideways' })
    expect(res.status).toBe(400)
  })
})
