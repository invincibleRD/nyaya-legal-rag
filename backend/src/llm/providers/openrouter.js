import { config } from '../../core/config.js'
import { requireKey } from './http.js'
import * as openai from './openaiCompat.js'

export const fastModel = 'google/gemini-2.0-flash-lite-001'

function target() {
  requireKey(config.llm.openrouterKey, 'OPENROUTER_API_KEY', 'openrouter')
  return {
    provider: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: { authorization: `Bearer ${config.llm.openrouterKey}` },
  }
}

export async function* stream(req) {
  yield* openai.stream(target(), req)
}

export async function complete(req) {
  return openai.complete(target(), req)
}
