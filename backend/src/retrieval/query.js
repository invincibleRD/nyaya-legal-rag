import { getProvider } from '../llm/provider.js'
import { logger } from '../core/logger.js'

// "section 103", "s.63", "BNSS 103", "section 35(3)". the \b stops "BNSS 2023" matching.
const SECTION_RE =
  /\b(?:sections?|secs?\.?|s\.|u\/s\.?|bnss|bns|crpc)\s*(\d{1,3})\b\s*(\([0-9a-z]{1,3}\))?/i

const INTENTS = new Set(['concept', 'document', 'out_of_scope'])

const REWRITE_SYSTEM = `Rewrite the user's last message as a question that stands on its own.
Resolve pronouns and implied references from the conversation, and name the section or act once the
conversation makes it clear. Keep the user's own wording everywhere else.
Answer with the question and nothing else.`

const TRIAGE_SYSTEM = `You triage questions for a search engine over the Bharatiya Nagarik Suraksha
Sanhita (BNSS), 2023.
Reply with JSON only: {"intent": "concept" | "document" | "out_of_scope", "passage": "..."}
concept - criminal procedure, police powers, arrest, bail, trial, anything the BNSS covers.
document - the user is asking about a file they uploaded.
out_of_scope - everything else.
passage - 2 to 4 sentences answering the question in the voice of an Indian bare act, as if it were
the provision itself. Write it plainly, do not hedge and do not say it is hypothetical.
Use "" when the intent is out_of_scope.`

export function detectSectionIntent(text) {
  const m = SECTION_RE.exec(text || '')
  if (!m) return null
  return { number: m[1], subsection: m[2] || null }
}

export async function transformQuery({ message, history }) {
  const raw = (message || '').trim()
  const turns = history?.length ? history.slice(-6) : []
  const standalone = turns.length ? await rewrite(raw, turns) : raw
  const search = sparseQuery(raw, standalone)

  if (detectSectionIntent(standalone) || detectSectionIntent(raw)) {
    return { search, hyde: null, standalone, intent: 'section_lookup' }
  }

  const { intent, hyde } = await triage(standalone)
  return { search, hyde, standalone, intent }
}

// hyde text never goes in here, it would drown the keywords the user actually typed
function sparseQuery(message, standalone) {
  if (!standalone || standalone.toLowerCase() === message.toLowerCase()) return message
  return `${message} ${standalone}`
}

// query understanding always runs on the cheap model, never the answering one
function ask(req) {
  const provider = getProvider()
  return provider.complete({ model: provider.fastModel, ...req })
}

async function rewrite(message, turns) {
  const messages = turns.map((t) => ({ role: t.role, content: t.content }))
  messages.push({ role: 'user', content: message })

  try {
    const { text } = await ask({
      system: REWRITE_SYSTEM,
      messages,
      temperature: 0,
      maxTokens: 80,
    })
    return firstLine(text) || message
  } catch (err) {
    logger.warn({ err }, 'query rewrite failed, using the raw message')
    return message
  }
}

async function triage(question) {
  try {
    const { text } = await ask({
      system: TRIAGE_SYSTEM,
      messages: [{ role: 'user', content: question }],
      temperature: 0.2,
      maxTokens: 220,
    })
    const parsed = parseJson(text)
    const intent = INTENTS.has(parsed?.intent) ? parsed.intent : 'concept'
    const passage = typeof parsed?.passage === 'string' ? parsed.passage.trim() : ''
    return { intent, hyde: intent === 'out_of_scope' ? null : passage || null }
  } catch (err) {
    logger.warn({ err }, 'query triage failed, treating it as a concept question')
    return { intent: 'concept', hyde: null }
  }
}

// the model likes to wrap its json in a fence or a sentence
function parseJson(text) {
  const m = /\{[\s\S]*\}/.exec(text || '')
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

function firstLine(text) {
  const line = (text || '').trim().split('\n')[0]
  return line.replace(/^["']|["']$/g, '').trim()
}
