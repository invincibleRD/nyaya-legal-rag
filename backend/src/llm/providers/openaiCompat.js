import { config } from '../../core/config.js'
import { post, sseData } from './http.js'

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
  for await (const data of sseData(res)) {
    const chunk = JSON.parse(data)
    const text = chunk.choices?.[0]?.delta?.content
    if (text) yield { text }
    if (chunk.usage) usage = usageOf(chunk)
  }
  // last delta carries usage and no text
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
  return { text: json.choices?.[0]?.message?.content || '', usage: usageOf(json) }
}
