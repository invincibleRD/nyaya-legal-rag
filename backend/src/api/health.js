import { Router } from 'express'
import { config } from '../core/config.js'

export const health = Router()

health.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// each dependency reports on its own so a red light points at the right box
health.get('/health/ready', async (_req, res) => {
  const checks = await Promise.all([
    probe('qdrant', `${config.qdrant.url}/readyz`),
    probe('embeddings', `${config.embedding.url}/health`),
  ])

  const services = Object.fromEntries(checks.map((c) => [c.name, c]))
  const ready = checks.every((c) => c.ok)
  res.status(ready ? 200 : 503).json({ ready, services })
})

async function probe(name, url) {
  const started = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return { name, ok: res.ok, ms: Date.now() - started }
  } catch (err) {
    return { name, ok: false, ms: Date.now() - started, error: err.message }
  }
}
