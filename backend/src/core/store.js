import { nanoid } from 'nanoid'
import { redis } from './redis.js'

const TTL = 60 * 60 * 24 * 30

const key = {
  conversation: (id) => `conv:${id}`,
  messages: (id) => `conv:${id}:messages`,
  sessionConversations: (s) => `session:${s}:conversations`,
  document: (id) => `doc:${id}`,
  sessionDocuments: (s) => `session:${s}:documents`,
  feedback: () => 'feedback',
}

export async function createConversation(sessionId, title = 'New chat') {
  const id = nanoid()
  const now = new Date().toISOString()
  const conv = { id, session_id: sessionId, title, created_at: now, updated_at: now }

  const r = redis()
  await r.hset(key.conversation(id), conv)
  await r.expire(key.conversation(id), TTL)
  await r.zadd(key.sessionConversations(sessionId), Date.now(), id)
  await r.expire(key.sessionConversations(sessionId), TTL)
  return conv
}

export async function getConversation(id, sessionId) {
  const conv = await redis().hgetall(key.conversation(id))
  if (!conv.id) return null
  // ownership is a 404, never a 403, so we do not confirm the id exists
  if (conv.session_id !== sessionId) return null
  return conv
}

export async function listConversations(sessionId) {
  const ids = await redis().zrevrange(key.sessionConversations(sessionId), 0, 49)
  const convs = await Promise.all(ids.map((id) => redis().hgetall(key.conversation(id))))
  return convs.filter((c) => c.id)
}

export async function countConversations(sessionId) {
  return redis().zcard(key.sessionConversations(sessionId))
}

export async function renameConversation(id, sessionId, title) {
  const conv = await getConversation(id, sessionId)
  if (!conv) return null
  await redis().hset(key.conversation(id), { title, updated_at: new Date().toISOString() })
  return { ...conv, title }
}

export async function deleteConversation(id, sessionId) {
  const conv = await getConversation(id, sessionId)
  if (!conv) return false
  const r = redis()
  await r.del(key.conversation(id), key.messages(id))
  await r.zrem(key.sessionConversations(sessionId), id)
  return true
}

export async function addMessage(conversationId, message) {
  const entry = { id: nanoid(), created_at: new Date().toISOString(), ...message }
  const r = redis()
  await r.rpush(key.messages(conversationId), JSON.stringify(entry))
  await r.expire(key.messages(conversationId), TTL)
  await r.hset(key.conversation(conversationId), { updated_at: entry.created_at })
  return entry
}

export async function getMessages(conversationId, limit = 50) {
  const raw = await redis().lrange(key.messages(conversationId), -limit, -1)
  return raw.map((r) => JSON.parse(r))
}

export async function createDocument(sessionId, doc) {
  const id = nanoid()
  const record = {
    id,
    session_id: sessionId,
    status: 'queued',
    progress: '0',
    created_at: new Date().toISOString(),
    ...doc,
  }
  const r = redis()
  await r.hset(key.document(id), record)
  await r.expire(key.document(id), TTL)
  await r.sadd(key.sessionDocuments(sessionId), id)
  await r.expire(key.sessionDocuments(sessionId), TTL)
  return record
}

export async function updateDocument(id, patch) {
  await redis().hset(key.document(id), patch)
}

export async function getDocument(id, sessionId) {
  const doc = await redis().hgetall(key.document(id))
  if (!doc.id || doc.session_id !== sessionId) return null
  return doc
}

export async function listDocuments(sessionId) {
  const ids = await redis().smembers(key.sessionDocuments(sessionId))
  const docs = await Promise.all(ids.map((id) => redis().hgetall(key.document(id))))
  return docs.filter((d) => d.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function countDocuments(sessionId) {
  return redis().scard(key.sessionDocuments(sessionId))
}

export async function deleteDocument(id, sessionId) {
  const doc = await getDocument(id, sessionId)
  if (!doc) return null
  const r = redis()
  await r.del(key.document(id))
  await r.srem(key.sessionDocuments(sessionId), id)
  return doc
}

export async function saveFeedback(entry) {
  await redis().rpush(key.feedback(), JSON.stringify({ ...entry, at: new Date().toISOString() }))
}
