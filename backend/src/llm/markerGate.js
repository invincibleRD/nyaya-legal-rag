// Streaming and citation stripping pull against each other: tokens should reach
// the user immediately, but an invented [BNSS s.999] must never be shown. So we
// hold back from an unmatched '[' until its ']' arrives, judge that one marker,
// then emit it or drop it. Nothing else is delayed.
const LOOKS_LIKE_CITATION = /^\[[^\]]*(?:\d|BNSS|BNS|s\.)/i

export function createMarkerGate(check) {
  let buffer = ''

  function drain(final) {
    let out = ''
    for (;;) {
      const open = buffer.indexOf('[')
      if (open === -1) {
        out += buffer
        buffer = ''
        return out
      }
      out += buffer.slice(0, open)
      buffer = buffer.slice(open)

      const close = buffer.indexOf(']')
      if (close === -1) {
        // still waiting on the closing bracket
        if (!final) return out
        // stream ended mid marker, a half written citation is not worth showing
        if (!LOOKS_LIKE_CITATION.test(buffer)) out += buffer
        buffer = ''
        return out
      }

      const marker = buffer.slice(0, close + 1)
      buffer = buffer.slice(close + 1)
      out += check(marker).text
    }
  }

  return {
    push(text) {
      buffer += text
      return drain(false)
    },
    flush: () => drain(true),
  }
}
