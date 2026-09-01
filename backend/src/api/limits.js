import { isIPv6 } from 'node:net'
import rateLimit, { MemoryStore } from 'express-rate-limit'
import { config } from '../core/config.js'
import { redisIfReady } from '../core/redis.js'
import { throttled } from '../core/metrics.js'

// The session id comes off a client supplied header, so it can be rotated per
// request and is worth nothing as a budget. Every real limit below is keyed on
// the ip express derives from `trust proxy`; the session keyed ones are only
// there to give a well behaved tab a friendlier message first.

// express-rate-limit 7.5.0 predates the ipKeyGenerator helper, so do its job
// here: one ipv6 /56 is one client, otherwise a single host mints unlimited
// keys out of the prefix it was handed.
export function ipKey(req) {
  const ip = (req.ip || req.socket?.remoteAddress || 'unknown').replace(/^::ffff:/, '')
  if (!isIPv6(ip) || ip.includes('.')) return ip
  const [head, tail = ''] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const pad = 8 - left.length - right.length
  if (pad < 0) return ip
  const hextets = [...left, ...Array(pad).fill('0'), ...right]
  const bits = hextets.reduce((acc, h) => (acc << 16n) | BigInt(parseInt(h, 16) || 0), 0n)
  return `${(bits >> 72n).toString(16)}::/56`
}

const sessionKey = (req) => req.sessionId || ipKey(req)

const refuse = (limit, message) => (_req, res) => {
  throttled.inc({ limit })
  res.status(429).json({ error: 'rate_limited', message })
}

// INCR plus PEXPIRE is enough for a fixed window and survives a restart, which
// an in-process counter does not. Redis being unreachable falls back to the
// library's own memory store rather than dropping the limit entirely.
class RedisStore {
  constructor(prefix) {
    this.prefix = `rl:${prefix}:`
    this.localKeys = false
  }

  init(options) {
    this.options = options
    this.windowMs = options.windowMs
  }

  memory() {
    if (!this.fallback) {
      this.fallback = new MemoryStore()
      this.fallback.init(this.options)
    }
    return this.fallback
  }

  async increment(key) {
    const r = redisIfReady()
    if (!r) return this.memory().increment(key)
    try {
      const k = this.prefix + key
      const [[, hits], [, ttl]] = await r.multi().incr(k).pttl(k).exec()
      if (ttl < 0) await r.pexpire(k, this.windowMs)
      return {
        totalHits: hits,
        resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)),
      }
    } catch {
      return this.memory().increment(key)
    }
  }

  async decrement(key) {
    const r = redisIfReady()
    if (!r) return this.memory().decrement(key)
    try {
      await r.decr(this.prefix + key)
    } catch {
      /* a lost decrement only makes the window slightly stricter */
    }
  }

  async resetKey(key) {
    const r = redisIfReady()
    if (!r) return this.memory().resetKey(key)
    try {
      await r.del(this.prefix + key)
    } catch {
      /* ditto */
    }
  }
}

function limiter({ name, windowMs, limit, message, key = ipKey, skip }) {
  return rateLimit({
    windowMs,
    limit,
    skip,
    keyGenerator: key,
    store: new RedisStore(name),
    standardHeaders: true,
    legacyHeaders: false,
    handler: refuse(name, message),
  })
}

export const globalLimiter = limiter({
  name: 'global',
  windowMs: 60_000,
  limit: config.limits.globalPerMin,
  message: 'too many requests, slow down',
  // uptime probes and the scrape should not spend a real client's budget
  skip: (req) => req.path === '/metrics' || req.path.startsWith('/health'),
})

export const chatLimiter = limiter({
  name: 'chat',
  windowMs: 60_000,
  limit: config.limits.chatPerIpPerMin,
  message: 'too many questions, slow down',
})

export const chatSessionLimiter = limiter({
  name: 'chat-session',
  windowMs: 60_000,
  limit: config.limits.chatPerMin,
  message: 'too many questions, slow down',
  key: sessionKey,
})

export const searchLimiter = limiter({
  name: 'search',
  windowMs: 60_000,
  limit: config.limits.searchPerIpPerMin,
  message: 'too many searches, slow down',
})

export const uploadLimiter = limiter({
  name: 'upload',
  windowMs: 60 * 60 * 1000,
  limit: config.limits.uploadPerIpPerHour,
  message: 'too many uploads this hour',
})

export const uploadSessionLimiter = limiter({
  name: 'upload-session',
  windowMs: 60 * 60 * 1000,
  limit: config.limits.uploadPerHour,
  message: 'too many uploads this hour',
  key: sessionKey,
})

export const downloadAllLimiter = limiter({
  name: 'download-all',
  windowMs: 60 * 60 * 1000,
  limit: config.limits.downloadAllPerIpPerHour,
  message: 'the full forms bundle can only be downloaded a few times an hour',
})

// Concurrency, not rate: a per minute counter cannot see fifty sse streams held
// open at once, and those are the expensive ones. Deliberately in-process --
// the cap that matters is what this box is generating right now.
const inFlight = new Map()
let inFlightTotal = 0

export function acquireChatSlot(key) {
  const held = inFlight.get(key) || 0
  if (inFlightTotal >= config.limits.concurrentChatTotal) return null
  if (held >= config.limits.concurrentChatPerIp) return null

  inFlight.set(key, held + 1)
  inFlightTotal++

  // released from several exit paths, and a slot leaked here wedges the box
  let done = false
  return () => {
    if (done) return
    done = true
    inFlightTotal--
    const left = (inFlight.get(key) || 1) - 1
    if (left > 0) inFlight.set(key, left)
    else inFlight.delete(key)
  }
}

export const inFlightChats = () => inFlightTotal

// The slot is handed to the route on `req` as well as being tied to the
// response, because an async handler that rejects never ends the response and
// a leaked slot is worse than no cap at all.
export function chatConcurrency(req, res, next) {
  const release = acquireChatSlot(ipKey(req))
  if (!release) {
    throttled.inc({ limit: 'chat-concurrency' })
    return res.status(429).json({
      error: 'rate_limited',
      message: 'too many answers already generating for you, wait for one to finish',
    })
  }
  req.releaseChatSlot = release
  res.on('close', release)
  res.on('finish', release)
  next()
}
