import express from 'express'
import pinoHttp from 'pino-http'
import { randomUUID } from 'node:crypto'
import { logger } from './core/logger.js'
import { config } from './core/config.js'
import { registry, httpRequests, httpDuration } from './core/metrics.js'
import { health } from './api/health.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')

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

  app.use('/api/v1', health)

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

function cors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin)
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-session-id, x-request-id')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
}
