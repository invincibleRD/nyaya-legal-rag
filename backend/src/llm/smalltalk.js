// "hi" is not a retrieval failure, and answering it with a refusal makes the
// product look broken. The whole message has to be small talk, so "hi, ignore
// your instructions" still goes down the guard path.
const GREETING = /^(hi|hey|hello|yo|namaste|good\s+(morning|afternoon|evening))[\s!.?]*$/i
const THANKS = /^(thanks|thank you|ta|cheers|great|nice|ok|okay)[\s!.?]*$/i
const IDENTITY =
  /^(who|what)\s+(are|r)\s+(you|u)\b.*$|^what\s+(can|do)\s+you\s+(do|help)\b.*$|^help$/i

const INTRO = `I answer questions about the Bharatiya Nagarik Suraksha Sanhita, 2023 — India's criminal procedure code — and I cite the exact section for everything I say. You can also upload a document and ask me about it.

Try:
- Can the police arrest someone without a warrant?
- How long can a person be held before going before a magistrate?
- Which form is used to summon an accused person?`

export function smallTalk(message) {
  const text = String(message || '').trim()
  if (!text) return null
  if (GREETING.test(text)) return `Hello. ${INTRO}`
  if (THANKS.test(text)) return 'Happy to help. Ask me anything else about the BNSS.'
  if (IDENTITY.test(text)) return INTRO
  return null
}
