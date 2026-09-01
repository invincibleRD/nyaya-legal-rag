const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v))
const bool = (v, fallback) => (v === undefined || v === '' ? fallback : v === 'true')

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 8000),
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // number of proxies in front of us, counted from the socket inwards. never
  // `true`: that would let any client forge its own source ip through
  // X-Forwarded-For and walk past every ip keyed limit below.
  // production is gclb -> nginx -> app, which is 3. see .env.example.
  trustProxyHops: num(process.env.TRUST_PROXY_HOPS, 0),

  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    statuteCollection: process.env.STATUTE_COLLECTION || 'bnss_statute',
    docsCollection: process.env.DOCS_COLLECTION || 'user_docs',
  },

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisEnabled: bool(process.env.REDIS_ENABLED, true),

  embedding: {
    url: process.env.EMBEDDING_URL || 'http://localhost:8081',
    model: process.env.EMBEDDING_MODEL || 'BAAI/bge-base-en-v1.5',
    dim: num(process.env.EMBEDDING_DIM, 768),
    queryPrefix:
      process.env.EMBEDDING_QUERY_PREFIX ||
      'Represent this sentence for searching relevant passages:',
    batchSize: num(process.env.EMBEDDING_BATCH_SIZE, 32),
  },

  rerank: {
    enabled: bool(process.env.RERANK_ENABLED, false),
    url: process.env.RERANKER_URL || 'http://localhost:8082',
    poolSize: num(process.env.RERANK_POOL, 6),
    maxChars: num(process.env.RERANK_MAX_CHARS, 1800),
  },

  llm: {
    provider: process.env.LLM_PROVIDER || 'gemini',
    model: process.env.LLM_MODEL || 'gemini-3.6-flash',
    geminiKey: process.env.GEMINI_API_KEY || '',
    openrouterKey: process.env.OPENROUTER_API_KEY || '',
    groqKey: process.env.GROQ_API_KEY || '',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  },

  retrieval: {
    topK: num(process.env.RETRIEVAL_TOP_K, 8),
    candidatePool: num(process.env.CANDIDATE_POOL, 40),
    rrfK: num(process.env.RRF_K, 20),
    confidenceThreshold: num(process.env.CONFIDENCE_THRESHOLD, 0.58),
    documentConfidenceThreshold: num(process.env.DOCUMENT_CONFIDENCE_THRESHOLD, 0.38),
  },

  limits: {
    maxUploadMb: num(process.env.MAX_UPLOAD_MB, 25),

    // per session, a courtesy so one tab does not spam itself. the session id
    // is client chosen, so these are ux and never the security boundary.
    chatPerMin: num(process.env.CHAT_RATE_LIMIT_PER_MIN, 20),
    uploadPerHour: num(process.env.UPLOAD_RATE_LIMIT_PER_HOUR, 10),

    // per ip, the budget that actually holds
    globalPerMin: num(process.env.GLOBAL_RATE_LIMIT_PER_MIN, 300),
    chatPerIpPerMin: num(process.env.CHAT_RATE_LIMIT_PER_IP_PER_MIN, 10),
    searchPerIpPerMin: num(process.env.SEARCH_RATE_LIMIT_PER_IP_PER_MIN, 20),
    uploadPerIpPerHour: num(process.env.UPLOAD_RATE_LIMIT_PER_IP_PER_HOUR, 10),
    downloadAllPerIpPerHour: num(process.env.DOWNLOAD_ALL_RATE_LIMIT_PER_IP_PER_HOUR, 3),

    // a per minute counter cannot see 50 open sse streams, so count them too
    concurrentChatPerIp: num(process.env.MAX_CONCURRENT_CHAT_PER_IP, 2),
    concurrentChatTotal: num(process.env.MAX_CONCURRENT_CHAT_TOTAL, 12),

    conversationsPerSession: num(process.env.MAX_CONVERSATIONS_PER_SESSION, 50),
    documentsPerSession: num(process.env.MAX_DOCUMENTS_PER_SESSION, 20),
  },

  corpus: {
    dataDir: process.env.DATA_DIR || './data',
    sourcePdf: process.env.SOURCE_PDF || './data/raw/bnss-2023.pdf',
    sourceUri: process.env.SOURCE_URI || '',
    formsPageStart: num(process.env.FORMS_PAGE_START, 190),
    formsPageEnd: num(process.env.FORMS_PAGE_END, 249),
  },

  cost: {
    per1mInput: num(process.env.COST_PER_1M_INPUT, 0.1),
    per1mOutput: num(process.env.COST_PER_1M_OUTPUT, 0.4),
    // 0 disables the breaker
    dailyCeilingUsd: num(process.env.DAILY_COST_CEILING_USD, 5),
  },
}
