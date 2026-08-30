import { config } from '../../core/config.js'
import { post, readLines } from './http.js'

export const fastModel = 'llama3.2:3b'

function body({ system, messages, temperature, maxTokens, model }, stream) {
  return {
    model: model || config.llm.model,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    stream,
    options: { temperature: temperature ?? 0.2, num_predict: maxTokens ?? 1024 },
  }
}

function usageOf(json) {
  return { input_tokens: json.prompt_eval_count || 0, output_tokens: json.eval_count || 0 }
}

function call(req, stream) {
  return post(`${config.llm.ollamaUrl}/api/chat`, {
    provider: 'ollama',
    body: body(req, stream),
    signal: req.signal,
  })
}

export async function* stream(req) {
  const res = await call(req, true)
  let usage = null
  for await (const line of readLines(res)) {
    const chunk = JSON.parse(line)
    const text = chunk.message?.content
    if (text) yield { text }
    if (chunk.done) usage = usageOf(chunk)
  }
  // last delta carries usage and no text
  if (usage) yield { text: '', usage }
}

export async function complete(req) {
  const res = await call(req, false)
  const json = await res.json()
  return { text: json.message?.content || '', usage: usageOf(json) }
}
