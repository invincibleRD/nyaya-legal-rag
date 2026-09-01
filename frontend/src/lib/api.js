const BASE = 'https://hrn.ultronai.me'
const ROOT = `${BASE}/api/v1`

function sessionId() {
  let id = localStorage.getItem('nyaya.session')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('nyaya.session', id)
  }
  return id
}

export function headers(extra) {
  return { 'x-session-id': sessionId(), ...extra }
}

export class ApiError extends Error {
  constructor(code, message, requestId) {
    super(message)
    this.code = code
    this.requestId = requestId
  }
}

async function toError(res) {
  const body = await res.json().catch(() => null)
  return new ApiError(
    body?.error || 'internal_error',
    body?.message || res.statusText,
    res.headers.get('x-request-id')
  )
}

async function request(path, options = {}) {
  const res = await fetch(ROOT + path, {
    ...options,
    headers: headers(options.headers),
  })
  if (!res.ok) throw await toError(res)
  if (res.status === 204) return null
  return res.json()
}

export const listConversations = () => request('/conversations')
export const getConversation = (id) => request(`/conversations/${id}`)
export const renameConversation = (id, title) =>
  request(`/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  })
export const deleteConversation = (id) => request(`/conversations/${id}`, { method: 'DELETE' })

export const listDocuments = () => request('/documents')
export const documentStatus = (id) => request(`/documents/${id}/status`)
export const deleteDocument = (id) => request(`/documents/${id}`, { method: 'DELETE' })

export function uploadDocument(file) {
  const form = new FormData()
  form.append('file', file)
  return request('/documents/upload', { method: 'POST', body: form })
}

export const listForms = () => request('/forms')
export const searchForms = (q) => request(`/forms/search?q=${encodeURIComponent(q)}`)

// the session header rules out a plain <a href>, so files come back as blobs
async function blob(path) {
  const res = await fetch(ROOT + path, { headers: headers() })
  if (!res.ok) throw await toError(res)
  return res.blob()
}

export const formPdf = (formNumber) => blob(`/forms/${encodeURIComponent(formNumber)}/download`)
export const formsZip = () => blob('/forms/download-all')

export const sendFeedback = (payload) =>
  request('/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

// posts the turn and yields sse events as they arrive
export async function* streamChat(body, signal) {
  const res = await fetch(`${ROOT}/chat`, {
    method: 'POST',
    signal,
    headers: headers({ 'content-type': 'application/json', accept: 'text/event-stream' }),
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) throw await toError(res)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let split
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      const parsed = parseFrame(frame)
      if (parsed) yield parsed
    }
  }
}

function parseFrame(frame) {
  let event = 'message'
  const data = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trim())
  }
  if (!data.length) return null
  try {
    return { event, data: JSON.parse(data.join('\n')) }
  } catch {
    return null
  }
}
