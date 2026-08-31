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

// the pieces a legal rag actually lives or dies on: how long retrieval took,
// what the model cost, and how often we refused rather than guessed
export const retrievalDuration = new client.Histogram({
  name: 'nyaya_retrieval_seconds',
  help: 'hybrid retrieval latency, embedding and rerank included',
  labelNames: ['route'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
})

export const embeddingDuration = new client.Histogram({
  name: 'nyaya_embedding_seconds',
  help: 'time in the embedding server',
  labelNames: ['kind'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1, 5, 30],
  registers: [registry],
})

export const rerankDuration = new client.Histogram({
  name: 'nyaya_rerank_seconds',
  help: 'time in the cross encoder',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
})

export const generationDuration = new client.Histogram({
  name: 'nyaya_generation_seconds',
  help: 'time streaming an answer out of the model',
  buckets: [0.5, 1, 2, 3, 5, 8, 13, 21, 34],
  registers: [registry],
})

export const llmTokens = new client.Counter({
  name: 'nyaya_llm_tokens_total',
  help: 'tokens billed, by direction',
  labelNames: ['direction', 'model'],
  registers: [registry],
})

export const queryCost = new client.Counter({
  name: 'nyaya_query_cost_usd_total',
  help: 'estimated spend, tokens times the provider rate',
  labelNames: ['model'],
  registers: [registry],
})

export const refusals = new client.Counter({
  name: 'nyaya_refusals_total',
  help: 'answers withheld, by why',
  labelNames: ['reason'],
  registers: [registry],
})

export const uploads = new client.Counter({
  name: 'nyaya_uploads_total',
  help: 'documents accepted for ingestion',
  labelNames: ['outcome'],
  registers: [registry],
})

export const citationsStripped = new client.Counter({
  name: 'nyaya_citations_stripped_total',
  help: 'citations the model invented and the guard removed',
  registers: [registry],
})

export const dependencyUp = new client.Gauge({
  name: 'nyaya_dependency_up',
  help: '1 when a dependency answered its health probe',
  labelNames: ['dependency'],
  registers: [registry],
})

// a histogram observation in seconds from a start taken with Date.now()
export const since = (started) => (Date.now() - started) / 1000
