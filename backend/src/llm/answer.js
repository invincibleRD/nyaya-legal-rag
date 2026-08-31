import { getProvider } from './provider.js'
import { checkInput } from './guards/input.js'
import { findDocumentInjection } from './guards/patterns.js'
import { makeMarkerChecker, shouldRefuse, validateCitations } from './guards/output.js'
import { createMarkerGate } from './markerGate.js'
import { ANSWER_SYSTEM, buildContext, REFUSAL } from './prompts.js'
import { transformQuery } from '../retrieval/query.js'
import { retrieve } from '../retrieval/hybrid.js'
import { estimateCost } from './cost.js'
import { config } from '../core/config.js'
import {
  citationsStripped,
  generationDuration,
  llmTokens,
  queryCost,
  refusals,
  since,
} from '../core/metrics.js'
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
    refusals.inc({ reason: guard.category })
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
    refusals.inc({ reason: 'low_confidence' })
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

  const clean = neutralise(found.results, log)
  const gate = createMarkerGate(makeMarkerChecker(clean))
  const messages = [
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: `${buildContext(clean)}\n\nQuestion: ${message}` },
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

  const model = config.llm.model
  generationDuration.observe(since(generationStart))
  llmTokens.inc({ direction: 'input', model }, usage.input_tokens || 0)
  llmTokens.inc({ direction: 'output', model }, usage.output_tokens || 0)
  queryCost.inc({ model }, estimateCost(usage))

  // the gate already kept invented markers off the wire; this second pass is
  // what tells us whether it had to, and builds the citation cards
  const checked = validateCitations({ answer: raw, contexts: clean })
  if (!checked.valid) {
    citationsStripped.inc(checked.stripped.length)
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

// an uploaded pdf is untrusted text. anything in it that reads as an instruction
// is cut out before it reaches the prompt, so the model never sees the order at
// all rather than being asked nicely to ignore it.
function neutralise(results, log) {
  return results.map((r) => {
    if (r.source !== 'document') return r
    const sentences = String(r.text).split(/(?<=[.!?])\s+/)
    const kept = []
    let removed = 0
    for (const sentence of sentences) {
      if (findDocumentInjection(sentence)) {
        removed++
        continue
      }
      kept.push(sentence)
    }
    if (!removed) return r
    log.warn(
      { document: r.document_name, removed },
      'stripped instruction-like text from an uploaded document'
    )
    return { ...r, text: kept.join(' '), injection_removed: removed }
  })
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
