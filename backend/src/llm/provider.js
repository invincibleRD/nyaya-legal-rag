import { config } from '../core/config.js'
import * as gemini from './providers/gemini.js'
import * as groq from './providers/groq.js'
import * as ollama from './providers/ollama.js'
import * as openrouter from './providers/openrouter.js'

const impls = { gemini, openrouter, groq, ollama }

// rough enough for budgeting, we never bill on it
export function countTokens(text) {
  return Math.ceil((text || '').length / 4)
}

export function getProvider() {
  const name = config.llm.provider
  const impl = impls[name]
  if (!impl) {
    throw new Error(`unknown LLM_PROVIDER "${name}", expected ${Object.keys(impls).join(' | ')}`)
  }
  return {
    name,
    // the key check has to run before the generator is constructed, otherwise it
    // throws on first next(), which for a route is after the headers went out
    stream: (req) => {
      impl.checkKey()
      return impl.stream(req)
    },
    complete: impl.complete,
    fastModel: impl.fastModel,
    countTokens,
  }
}

export function getFastModel() {
  return getProvider().fastModel
}
