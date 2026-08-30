import { config } from '../../core/config.js'
import { post, readLines, parseFrame, emptyAnswer } from './http.js'

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
  let any = false
  for await (const line of readLines(res)) {
    const chunk = parseFrame(line)
    if (!chunk) continue
    if (chunk.error) throw emptyAnswer('ollama', chunk.error)
    const text = chunk.message?.content
    if (text) {
      any = true
      yield { text }
    }
    if (chunk.done) usage = usageOf(chunk)
  }
  if (!any) throw emptyAnswer('ollama', 'stream carried no content')
  if (usage) yield { text: '', usage }
}

export async function complete(req) {
  const res = await call(req, false)
  const json = await res.json()
  if (json.error) throw emptyAnswer('ollama', json.error)
  const text = json.message?.content
  if (!text) throw emptyAnswer('ollama', 'empty response')
  return { text, usage: usageOf(json) }
}

export function checkKey() {}
