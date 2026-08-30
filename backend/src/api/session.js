import { randomUUID } from 'node:crypto'

// anonymous sessions: the client generates one and sends it back on every call
export function session(req, res, next) {
  const id = req.get('x-session-id')
  req.sessionId = id && /^[\w-]{8,64}$/.test(id) ? id : randomUUID()
  res.setHeader('x-session-id', req.sessionId)
  next()
}
