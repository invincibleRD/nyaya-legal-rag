import express from 'express'
import pinoHttp from 'pino-http'
import swaggerUi from 'swagger-ui-express'
import { randomUUID } from 'node:crypto'
import { logger } from './core/logger.js'
import { config } from './core/config.js'
import { registry, httpRequests, httpDuration } from './core/metrics.js'
import { health } from './api/health.js'
import { session } from './api/session.js'
import { forms } from './api/forms.js'
import { search } from './api/search.js'
import { chat } from './api/chat.js'
import { documents } from './api/documents.js'
import { feedback } from './api/feedback.js'
import { openapiSpec } from './api/openapi.js'
import { globalLimiter } from './api/limits.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  // a hop count, never `true`, or any client can forge its own X-Forwarded-For
  // and hand itself a fresh rate limit bucket per request
  app.set('trust proxy', config.trustProxyHops)

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'info'),
    })
  )

  app.use((req, res, next) => {
    res.setHeader('x-request-id', req.id)
    const done = httpDuration.startTimer({ method: req.method })
    res.on('finish', () => {
      const route = req.route?.path ? req.baseUrl + req.route.path : 'unmatched'
      done({ route })
      httpRequests.inc({ method: req.method, route, status: res.statusCode })
    })
    next()
  })

  app.use(express.json({ limit: '1mb' }))
  app.use(cors)
  app.use(securityHeaders)

  app.use('/api/v1', globalLimiter)
  app.use('/api/v1', health)
  app.use('/api/v1', session, forms)
  app.use('/api/v1', session, search)
  app.use('/api/v1', session, chat)
  app.use('/api/v1', session, documents)
  app.use('/api/v1', session, feedback)

  app.get('/docs/openapi.json', (_req, res) => res.json(openapiSpec))
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec))

  app.get('/api/v1/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType)
    res.end(await registry.metrics())
  })

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.originalUrl })
  })

  app.use((err, req, res, _next) => {
    req.log.error({ err }, 'request failed')
    res
      .status(err.status || 500)
      .json({ error: err.code || 'internal_error', message: err.message })
  })

  return app
}

// the few that matter without helmet. no HSTS: tls terminates at the load
// balancer, and no CSP, which would break the swagger ui bundle at /docs.
function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
}

// several allowed origins, so the header has to echo the caller rather than
// carry a list — a browser rejects more than one value. an origin that is not
// on the list simply gets no header, which is what blocks it.
function cors(req, res, next) {
  const origin = (req.get('origin') || '').replace(/\/$/, '')
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-session-id, x-request-id')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
}
