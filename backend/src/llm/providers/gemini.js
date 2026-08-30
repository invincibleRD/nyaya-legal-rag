import { config } from '../../core/config.js'
import { post, requireKey, sseData, parseFrame, emptyAnswer } from './http.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const fastModel = 'gemini-2.0-flash-lite'

function body({ system, messages, temperature, maxTokens }) {
  return {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      temperature: temperature ?? 0.2,
      maxOutputTokens: maxTokens ?? 1024,
    },
  }
}

function call(req, method) {
  requireKey(config.llm.geminiKey, 'GEMINI_API_KEY', 'gemini')
  const model = req.model || config.llm.model
  return post(`${BASE}/${model}:${method}`, {
    provider: 'gemini',
    headers: { 'x-goog-api-key': config.llm.geminiKey },
    body: body(req),
    signal: req.signal,
  })
}

function textOf(chunk) {
  const parts = chunk.candidates?.[0]?.content?.parts
  if (!parts) return ''
  return parts.map((p) => p.text || '').join('')
}

function blockReason(chunk) {
  if (chunk.error) return chunk.error.message || 'error'
  if (chunk.promptFeedback?.blockReason) return `blocked (${chunk.promptFeedback.blockReason})`
  const finish = chunk.candidates?.[0]?.finishReason
  if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') return `finishReason ${finish}`
  return null
}

function usageOf(chunk) {
  const u = chunk.usageMetadata || {}
  return { input_tokens: u.promptTokenCount || 0, output_tokens: u.candidatesTokenCount || 0 }
}

export async function* stream(req) {
  const res = await call(req, 'streamGenerateContent?alt=sse')
  let usage = null
  let any = false
  for await (const data of sseData(res)) {
    const chunk = parseFrame(data)
    if (!chunk) continue
    const blocked = blockReason(chunk)
    if (blocked) throw emptyAnswer('gemini', blocked)
    const text = textOf(chunk)
    if (text) {
      any = true
      yield { text }
    }
    if (chunk.usageMetadata) usage = usageOf(chunk)
  }
  if (!any) throw emptyAnswer('gemini', 'stream carried no content')
  if (usage) yield { text: '', usage }
}

export async function complete(req) {
  const res = await call(req, 'generateContent')
  const json = await res.json()
  const text = textOf(json)
  const blocked = blockReason(json)
  if (!text) throw emptyAnswer('gemini', blocked || 'empty response')
  return { text, usage: usageOf(json) }
}

export function checkKey() {
  requireKey(config.llm.geminiKey, 'GEMINI_API_KEY', 'gemini')
}
