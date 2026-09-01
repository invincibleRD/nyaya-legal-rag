import { Router } from 'express'
import { config } from '../core/config.js'
import { dependencyUp } from '../core/metrics.js'

export const health = Router()

health.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// each dependency reports on its own so a red light points at the right box
health.get('/health/ready', async (_req, res) => {
  const probes = [
    probe('qdrant', `${config.qdrant.url}/readyz`),
    probe('embeddings', `${config.embedding.url}/health`),
  ]
  if (config.rerank.enabled) probes.push(probe('reranker', `${config.rerank.url}/health`))
  const checks = await Promise.all(probes)
  for (const c of checks) dependencyUp.set({ dependency: c.name }, c.ok ? 1 : 0)

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
