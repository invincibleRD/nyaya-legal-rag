import client from 'prom-client'

export const registry = new client.Registry()
client.collectDefaultMetrics({ register: registry })

export const httpRequests = new client.Counter({
  name: 'nyaya_http_requests_total',
  help: 'http requests by route and status',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
})

export const httpDuration = new client.Histogram({
  name: 'nyaya_http_request_seconds',
  help: 'request latency',
  labelNames: ['method', 'route'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
})
