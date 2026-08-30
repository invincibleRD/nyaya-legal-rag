import { getProvider } from './provider.js'
import { checkInput } from './guards/input.js'
import { makeMarkerChecker, shouldRefuse, validateCitations } from './guards/output.js'
import { createMarkerGate } from './markerGate.js'
import { ANSWER_SYSTEM, buildContext, REFUSAL } from './prompts.js'
import { transformQuery } from '../retrieval/query.js'
import { retrieve } from '../retrieval/hybrid.js'
import { estimateCost } from './cost.js'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'

// The whole request as a stream of events. The route only has to turn these
// into SSE frames, which keeps the pipeline testable without a server.
export async function* answerStream({
  message,
  history = [],
  sessionId,
  documentIds = [],
  conversationId,
  signal,
  log = logger,
}) {
  const started = Date.now()

  const guard = await checkInput({ message, history })
  if (!guard.allow) {
    yield { type: 'meta', conversation_id: conversationId, route: 'refused' }
    yield { type: 'token', text: refusalFor(guard.category) }
    yield {
      type: 'done',
      refused: true,
      reason: guard.category,
      usage: { input_tokens: 0, output_tokens: 0 },
      latency: { retrieval_ms: 0, generation_ms: 0 },
      cost_usd: 0,
    }
    return
  }

  const query = await transformQuery({ message, history })
  const retrievalStart = Date.now()
  const found = await retrieve({
    query: query.search,
    hyde: query.hyde,
    sessionId,
    documentIds,
  })
  const retrievalMs = Date.now() - retrievalStart

  yield { type: 'meta', conversation_id: conversationId, route: found.route, intent: query.intent }

  if (shouldRefuse({ results: found.results })) {
    log.info(
      { top: found.top_score, threshold: config.retrieval.confidenceThreshold },
      'refused, nothing above the confidence threshold'
    )
    yield { type: 'token', text: REFUSAL }
    yield {
      type: 'done',
      refused: true,
      reason: 'low_confidence',
      top_score: found.top_score,
      usage: { input_tokens: 0, output_tokens: 0 },
      latency: { retrieval_ms: retrievalMs, generation_ms: 0 },
      cost_usd: 0,
    }
    return
  }

  const gate = createMarkerGate(makeMarkerChecker(found.results))
  const messages = [
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: `${buildContext(found.results)}\n\nQuestion: ${message}` },
  ]

  const generationStart = Date.now()
  let raw = ''
  let usage = { input_tokens: 0, output_tokens: 0 }

  const stream = getProvider().stream({
    system: ANSWER_SYSTEM,
    messages,
    temperature: 0.1,
    maxTokens: 1200,
    signal,
  })

  for await (const delta of stream) {
    if (delta.usage) usage = delta.usage
    if (!delta.text) continue
    raw += delta.text
    const safe = gate.push(delta.text)
    if (safe) yield { type: 'token', text: safe }
  }

  const tail = gate.flush()
  if (tail) yield { type: 'token', text: tail }
  const generationMs = Date.now() - generationStart

  // the gate already kept invented markers off the wire; this second pass is
  // what tells us whether it had to, and builds the citation cards
  const checked = validateCitations({ answer: raw, contexts: found.results })
  if (!checked.valid) {
    log.warn(
      { stripped: checked.stripped, prose: checked.invented_in_prose },
      'model cited something it was not given'
    )
  }

  yield { type: 'citations', citations: checked.citations }
  yield {
    type: 'done',
    refused: false,
    answer: checked.text,
    stripped: checked.stripped,
    invented_in_prose: checked.invented_in_prose,
    usage,
    latency: {
      retrieval_ms: retrievalMs,
      generation_ms: generationMs,
      total_ms: Date.now() - started,
    },
    cost_usd: estimateCost(usage),
  }
}

function refusalFor(category) {
  if (category === 'injection') {
    return 'That request tries to change how I work, so I will not act on it. Ask me about the BNSS instead.'
  }
  if (category === 'unsafe') {
    return 'I cannot help with that.'
  }
  return 'I only answer questions about Indian criminal law from the Bharatiya Nagarik Suraksha Sanhita, 2023.'
}
