import { config } from '../../core/config.js'
import { post, sseData, parseFrame, emptyAnswer } from './http.js'

function body({ system, messages, temperature, maxTokens, model }, stream) {
  return {
    model: model || config.llm.model,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    temperature: temperature ?? 0.2,
    max_tokens: maxTokens ?? 1024,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  }
}

function usageOf(json) {
  const u = json.usage || {}
  return { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 }
}

export async function* stream(target, req) {
  const res = await post(target.url, {
    provider: target.provider,
    headers: target.headers,
    body: body(req, true),
    signal: req.signal,
  })
  let usage = null
  let any = false
  for await (const data of sseData(res)) {
    const chunk = parseFrame(data)
    if (!chunk) continue
    // some gateways deliver a rate limit as a frame inside a 200 response
    if (chunk.error) throw emptyAnswer(target.provider, chunk.error.message || 'error frame')
    const text = chunk.choices?.[0]?.delta?.content
    if (text) {
      any = true
      yield { text }
    }
    if (chunk.usage) usage = usageOf(chunk)
  }
  if (!any) throw emptyAnswer(target.provider, 'stream carried no content')
  if (usage) yield { text: '', usage }
}

export async function complete(target, req) {
  const res = await post(target.url, {
    provider: target.provider,
    headers: target.headers,
    body: body(req, false),
    signal: req.signal,
  })
  const json = await res.json()
  if (json.error) throw emptyAnswer(target.provider, json.error.message || 'error')
  const text = json.choices?.[0]?.message?.content
  if (!text) throw emptyAnswer(target.provider, 'empty response')
  return { text, usage: usageOf(json) }
}
