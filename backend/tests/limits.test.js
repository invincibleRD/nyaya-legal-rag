import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

vi.mock('../src/core/store.js', () => ({
  createConversation: vi.fn(async (sessionId) => ({ id: 'conv-1', session_id: sessionId })),
  getConversation: vi.fn(async () => null),
  countConversations: vi.fn(async () => 0),
  listConversations: vi.fn(async () => []),
  renameConversation: vi.fn(async () => null),
  deleteConversation: vi.fn(async () => false),
  addMessage: vi.fn(async () => ({})),
  getMessages: vi.fn(async () => []),
  listDocuments: vi.fn(async () => []),
  countDocuments: vi.fn(async () => 0),
  getDocument: vi.fn(async () => null),
  createDocument: vi.fn(async () => ({ id: 'doc-1' })),
  updateDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => null),
  saveFeedback: vi.fn(async () => {}),
}))

vi.mock('../src/llm/answer.js', () => ({
  answerStream: vi.fn(async function* () {
    yield { type: 'done', refused: false, usage: { input_tokens: 1, output_tokens: 1 } }
  }),
}))

process.env.CHAT_RATE_LIMIT_PER_IP_PER_MIN = '3'
process.env.CHAT_RATE_LIMIT_PER_MIN = '1000'
process.env.TRUST_PROXY_HOPS = '1'
process.env.MAX_CONCURRENT_CHAT_PER_IP = '2'
process.env.MAX_CONCURRENT_CHAT_TOTAL = '3'

const { createApp } = await import('../src/app.js')
const { acquireChatSlot } = await import('../src/api/limits.js')

const app = createApp()
const ask = (session, forwardedFor) => {
  const req = request(app).post('/api/v1/chat').set('x-session-id', session)
  if (forwardedFor) req.set('x-forwarded-for', forwardedFor)
  return req.send({ message: 'what does section 43 say' })
}

describe('rate limits', () => {
  it('does not hand out fresh quota for a rotating x-session-id', async () => {
    const responses = []
    for (let i = 0; i < 5; i++) responses.push(await ask(`rotating-${i}0000000`))

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 429, 429])
    const refused = responses[4]
    expect(refused.body).toEqual({
      error: 'rate_limited',
      message: 'too many questions, slow down',
    })
    expect(refused.headers['ratelimit-limit']).toBe('3')
  })

  it('ignores a forged x-forwarded-for prefix, counting only the trusted hop', async () => {
    // one trusted hop means the last entry is what the proxy appended; anything
    // the client put in front of it must not open a new bucket
    const real = await ask('xff-session-0001', '203.0.113.9')
    expect(real.status).toBe(200)

    const spoofed = []
    for (const forged of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) {
      spoofed.push((await ask('xff-session-0001', `${forged}, 203.0.113.9`)).status)
    }
    expect(spoofed).toEqual([200, 200, 429])
  })
})

describe('chat concurrency', () => {
  it('caps in-flight streams and releases a slot exactly once', () => {
    const a = acquireChatSlot('1.2.3.4')
    const b = acquireChatSlot('1.2.3.4')
    expect(acquireChatSlot('1.2.3.4')).toBe(null)

    a()
    a() // a double release must not hand back a slot that was never held
    expect(acquireChatSlot('1.2.3.4')).toBeTypeOf('function')
    expect(acquireChatSlot('1.2.3.4')).toBe(null)
    b()
  })
})
