const TIMEOUT_MS = 120000

export function requireKey(key, envVar, provider) {
  if (!key) throw new Error(`${envVar} is not set, cannot use the ${provider} provider`)
}

export async function post(url, { provider, headers, body, signal, timeout = TIMEOUT_MS }) {
  const deadline = AbortSignal.timeout(timeout)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${provider} ${res.status}: ${detail.slice(0, 300)}`)
  }
  return res
}

export async function* readLines(res) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) yield line
    }
  }
  if (buffer.trim()) yield buffer.trim()
}

export async function* sseData(res) {
  for await (const line of readLines(res)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data === '[DONE]') return
    yield data
  }
}

// a single corrupt frame should cost one delta, not the whole answer
export function parseFrame(data) {
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

// providers signal refusals and rate limits with http 200 and no text, which
// would otherwise reach the user as a blank answer
export function emptyAnswer(provider, reason) {
  return new Error(`${provider} returned no text: ${reason}`)
}
