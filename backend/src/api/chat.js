import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { answerStream } from '../llm/answer.js'
import { config } from '../core/config.js'
import {
  addMessage,
  createConversation,
  getConversation,
  getMessages,
  listDocuments,
  renameConversation,
} from '../core/store.js'

export const chat = Router()

const limiter = rateLimit({
  windowMs: 60_000,
  limit: config.limits.chatPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.sessionId,
  handler: (_req, res) =>
    res.status(429).json({ error: 'rate_limited', message: 'too many questions, slow down' }),
})

const body = z.object({
  message: z.string().min(1).max(4000),
  conversation_id: z.string().nullish(),
  document_ids: z.array(z.string()).optional(),
})

chat.post('/chat', limiter, async (req, res) => {
  const parsed = body.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    })
  }

  const { message, conversation_id: given, document_ids: documentIds = [] } = parsed.data

  let conversation = given ? await getConversation(given, req.sessionId) : null
  if (given && !conversation) {
    return res.status(404).json({ error: 'not_found', message: 'no such conversation' })
  }
  if (!conversation) {
    conversation = await createConversation(req.sessionId, title(message))
  }

  // anything the session has finished ingesting is searchable without the client
  // having to name it, but it never reaches another session's retrieval
  const documents = documentIds.length
    ? documentIds
    : (await listDocuments(req.sessionId)).filter((d) => d.status === 'ready').map((d) => d.id)

  const history = await getMessages(conversation.id)
  await addMessage(conversation.id, { role: 'user', content: message })

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })

  // the client going away should stop the model, not just the writes
  const abort = new AbortController()
  req.on('close', () => abort.abort())

  let answer = ''
  let citations = []

  try {
    for await (const event of answerStream({
      message,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      sessionId: req.sessionId,
      documentIds: documents,
      conversationId: conversation.id,
      signal: abort.signal,
      log: req.log,
    })) {
      if (event.type === 'token') answer += event.text
      if (event.type === 'citations') citations = event.citations
      if (event.type === 'done' && event.answer) answer = event.answer
      send(res, event.type, event)
      if (res.flush) res.flush()
    }
  } catch (err) {
    req.log.error({ err }, 'chat stream failed')
    send(res, 'error', { error: 'internal_error', message: err.message })
  }

  if (answer && !abort.signal.aborted) {
    await addMessage(conversation.id, { role: 'assistant', content: answer, citations })
  }
  res.end()
})

chat.get('/conversations', async (req, res) => {
  const { listConversations } = await import('../core/store.js')
  res.json({ conversations: await listConversations(req.sessionId) })
})

chat.get('/conversations/:id', async (req, res) => {
  const conversation = await getConversation(req.params.id, req.sessionId)
  if (!conversation)
    return res.status(404).json({ error: 'not_found', message: 'no such conversation' })
  const messages = await getMessages(req.params.id)
  res.json({ ...conversation, messages })
})

chat.patch('/conversations/:id', async (req, res) => {
  const title = String(req.body?.title || '').trim()
  if (!title)
    return res.status(400).json({ error: 'validation_error', message: 'title is required' })
  const updated = await renameConversation(req.params.id, req.sessionId, title.slice(0, 120))
  if (!updated) return res.status(404).json({ error: 'not_found', message: 'no such conversation' })
  res.json(updated)
})

chat.delete('/conversations/:id', async (req, res) => {
  const { deleteConversation } = await import('../core/store.js')
  const gone = await deleteConversation(req.params.id, req.sessionId)
  if (!gone) return res.status(404).json({ error: 'not_found', message: 'no such conversation' })
  res.status(204).end()
})

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function title(message) {
  const clean = message.replace(/\s+/g, ' ').trim()
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean
}
