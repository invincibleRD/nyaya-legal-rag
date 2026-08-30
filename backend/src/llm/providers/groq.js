import { config } from '../../core/config.js'
import { requireKey } from './http.js'
import * as openai from './openaiCompat.js'

export const fastModel = 'llama-3.1-8b-instant'

function target() {
  requireKey(config.llm.groqKey, 'GROQ_API_KEY', 'groq')
  return {
    provider: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: { authorization: `Bearer ${config.llm.groqKey}` },
  }
}

export async function* stream(req) {
  yield* openai.stream(target(), req)
}

export async function complete(req) {
  return openai.complete(target(), req)
}
