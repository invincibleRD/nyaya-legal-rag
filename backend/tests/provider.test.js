import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/core/config.js'
import { estimateCost, sumUsage } from '../src/llm/cost.js'
import { countTokens, getFastModel, getProvider } from '../src/llm/provider.js'

const encoder = new TextEncoder()
const ask = { messages: [{ role: 'user', content: 'what is section 103 BNSS?' }] }

const savedLlm = { ...config.llm }
const savedCost = { ...config.cost }
let calls = []

function streamed(chunks) {
  return {
    ok: true,
    status: 200,
    body: (async function* () {
      for (const chunk of chunks) yield encoder.encode(chunk)
    })(),
  }
}

function replied(payload) {
  return { ok: true, status: 200, json: async () => payload }
}

function stubFetch(response) {
  vi.stubGlobal('fetch', async (url, opts) => {
    calls.push({ url, headers: opts.headers, body: JSON.parse(opts.body) })
    return response
  })
}

async function collect(deltas) {
  const out = []
  for await (const delta of deltas) out.push(delta)
  return out
}

beforeEach(() => {
  calls = []
  Object.assign(config.llm, {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    geminiKey: 'k-gemini',
    openrouterKey: 'k-openrouter',
    groqKey: 'k-groq',
    ollamaUrl: 'http://ollama:11434',
  })
})

afterEach(() => {
  Object.assign(config.llm, savedLlm)
  Object.assign(config.cost, savedCost)
  vi.unstubAllGlobals()
})

describe('gemini', () => {
  it('parses sse deltas and the trailing usage', async () => {
    stubFetch(
      streamed([
        'data: {"candidates":[{"content":{"parts":[{"text":"Section 103"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":" cove',
        'rs searches"}]}}]}\n\ndata: {"candidates":[{"content":{"parts":[{"text":"."}]}}],',
        '"usageMetadata":{"promptTokenCount":120,"candidatesTokenCount":18}}\n\n',
      ])
    )

    const deltas = await collect(getProvider().stream(ask))

    expect(deltas.map((d) => d.text).join('')).toBe('Section 103 covers searches.')
    expect(deltas.at(-1).usage).toEqual({ input_tokens: 120, output_tokens: 18 })
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse'
    )
    expect(calls[0].headers['x-goog-api-key']).toBe('k-gemini')
  })

  it('sends system text as systemInstruction and assistant turns as model', async () => {
    stubFetch(streamed(['data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n']))

    await collect(
      getProvider().stream({
        system: 'answer only from the statute',
        messages: [
          { role: 'user', content: 'section 35?' },
          { role: 'assistant', content: 'arrest without warrant' },
          { role: 'user', content: 'and its proviso?' },
        ],
      })
    )

    expect(calls[0].body.systemInstruction.parts[0].text).toBe('answer only from the statute')
    expect(calls[0].body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
  })

  it('completes without streaming', async () => {
    stubFetch(
      replied({
        candidates: [{ content: { parts: [{ text: 'out_of_scope' }] } }],
        usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 3 },
      })
    )

    const res = await getProvider().complete({ ...ask, model: getFastModel() })

    expect(res).toEqual({ text: 'out_of_scope', usage: { input_tokens: 40, output_tokens: 3 } })
    expect(calls[0].url).toContain(`${getFastModel()}:generateContent`)
  })
})

describe('openai compatible providers', () => {
  it('parses openrouter deltas, ignoring keepalives and [DONE]', async () => {
    config.llm.provider = 'openrouter'
    stubFetch(
      streamed([
        ': OPENROUTER PROCESSING\n\n',
        'data: {"choices":[{"delta":{"content":"Bail"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" is granted"}}]}\n\n',
        'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":90,"completion_tokens":12}}\n\n',
        'data: [DONE]\n\n',
      ])
    )

    const deltas = await collect(getProvider().stream(ask))

    expect(deltas.map((d) => d.text).join('')).toBe('Bail is granted')
    expect(deltas.at(-1).usage).toEqual({ input_tokens: 90, output_tokens: 12 })
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(calls[0].body.stream).toBe(true)
    expect(calls[0].body.stream_options).toEqual({ include_usage: true })
  })

  it('completes through groq with a bearer key', async () => {
    config.llm.provider = 'groq'
    stubFetch(
      replied({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 11, completion_tokens: 2 },
      })
    )

    const res = await getProvider().complete({ ...ask, system: 'be brief' })

    expect(res).toEqual({ text: 'ok', usage: { input_tokens: 11, output_tokens: 2 } })
    expect(calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(calls[0].headers.authorization).toBe('Bearer k-groq')
    expect(calls[0].body.messages[0]).toEqual({ role: 'system', content: 'be brief' })
    expect(calls[0].body.stream).toBe(false)
  })
})

describe('ollama', () => {
  it('parses ndjson lines and the done counters', async () => {
    config.llm.provider = 'ollama'
    config.llm.model = 'llama3.1'
    stubFetch(
      streamed([
        '{"message":{"content":"Sec"},"done":false}\n',
        '{"message":{"content":"tion 103"},"done":false}\n',
        '{"done":true,"prompt_eval_count":30,"eval_count":7}\n',
      ])
    )

    const deltas = await collect(getProvider().stream(ask))

    expect(deltas.map((d) => d.text).join('')).toBe('Section 103')
    expect(deltas.at(-1).usage).toEqual({ input_tokens: 30, output_tokens: 7 })
    expect(calls[0].url).toBe('http://ollama:11434/api/chat')
    expect(calls[0].headers.authorization).toBeUndefined()
    expect(calls[0].body.options).toEqual({ temperature: 0.2, num_predict: 1024 })
  })

  it('completes without a key', async () => {
    config.llm.provider = 'ollama'
    stubFetch(replied({ message: { content: 'yes' }, prompt_eval_count: 5, eval_count: 1 }))

    expect(await getProvider().complete(ask)).toEqual({
      text: 'yes',
      usage: { input_tokens: 5, output_tokens: 1 },
    })
  })
})

describe('provider selection', () => {
  it('throws on a provider it does not know', () => {
    config.llm.provider = 'bedrock'
    expect(() => getProvider()).toThrow(/unknown LLM_PROVIDER "bedrock"/)
  })

  it('gives every provider a cheap model distinct from the main one', () => {
    for (const name of ['gemini', 'openrouter', 'groq', 'ollama']) {
      config.llm.provider = name
      config.llm.model = 'the-big-expensive-one'
      const fast = getFastModel()
      expect(fast, name).toBeTruthy()
      expect(fast, name).not.toBe(config.llm.model)
    }
  })

  for (const [provider, key, envVar] of [
    ['gemini', 'geminiKey', 'GEMINI_API_KEY'],
    ['openrouter', 'openrouterKey', 'OPENROUTER_API_KEY'],
    ['groq', 'groqKey', 'GROQ_API_KEY'],
  ]) {
    it(`fails loudly when ${envVar} is missing`, async () => {
      config.llm.provider = provider
      config.llm[key] = ''
      vi.stubGlobal('fetch', () => {
        throw new Error('network was touched')
      })
      const p = getProvider()

      // stream throws on construction, before a route can flush headers
      expect(() => p.stream(ask)).toThrow(envVar)
      await expect(p.complete(ask)).rejects.toThrow(envVar)
    })
  }

  it('surfaces an http error with the status', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 429,
      text: async () => 'quota exceeded',
    }))

    await expect(collect(getProvider().stream(ask))).rejects.toThrow('gemini 429: quota exceeded')
  })
})

describe('abort', () => {
  function fetchThatWaitsForAbort() {
    let started
    const reached = new Promise((resolve) => (started = resolve))
    vi.stubGlobal('fetch', (url, opts) => {
      started(opts.signal)
      return new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    return reached
  }

  it('cancels a stream', async () => {
    const reached = fetchThatWaitsForAbort()
    const controller = new AbortController()

    const run = collect(getProvider().stream({ ...ask, signal: controller.signal }))
    const signal = await reached
    controller.abort()

    await expect(run).rejects.toThrow('aborted')
    expect(signal.aborted).toBe(true)
  })

  it('cancels a completion', async () => {
    config.llm.provider = 'groq'
    const reached = fetchThatWaitsForAbort()
    const controller = new AbortController()

    const run = getProvider().complete({ ...ask, signal: controller.signal })
    const signal = await reached
    controller.abort()

    await expect(run).rejects.toThrow('aborted')
    expect(signal.aborted).toBe(true)
  })
})

describe('cost', () => {
  beforeEach(() => {
    config.cost.per1mInput = 0.1
    config.cost.per1mOutput = 0.4
  })

  it('prices a million tokens at the configured rate', () => {
    expect(estimateCost({ input_tokens: 1000000, output_tokens: 500000 })).toBe(0.3)
  })

  it('keeps small answers above zero', () => {
    expect(estimateCost({ input_tokens: 1200, output_tokens: 300 })).toBe(0.00024)
  })

  it('handles missing usage', () => {
    expect(estimateCost(undefined)).toBe(0)
    expect(estimateCost({})).toBe(0)
  })

  it('adds usage across calls', () => {
    expect(
      sumUsage({ input_tokens: 10, output_tokens: 2 }, null, { input_tokens: 5, output_tokens: 1 })
    ).toEqual({ input_tokens: 15, output_tokens: 3 })
  })

  it('counts tokens roughly', () => {
    expect(countTokens('a'.repeat(400))).toBe(100)
    expect(countTokens('')).toBe(0)
  })
})

// these cover the http-200 failure modes: providers signal refusals and rate
// limits inside a successful response, which used to surface as a blank answer
describe('a 200 that carries no answer', () => {
  it('throws when gemini blocks the prompt instead of returning empty text', async () => {
    config.llm.provider = 'gemini'
    stubFetch(
      replied({ promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: { promptTokenCount: 9 } })
    )
    await expect(getProvider().complete(ask)).rejects.toThrow(/gemini returned no text.*SAFETY/)
  })

  it('throws when an openai-compatible gateway sends an error frame mid stream', async () => {
    config.llm.provider = 'openrouter'
    stubFetch(streamed(['data: {"error":{"code":429,"message":"rate limited"}}\n']))
    await expect(collect(getProvider().stream(ask))).rejects.toThrow(/rate limited/)
  })

  it('throws when ollama reports a missing model with a 200', async () => {
    config.llm.provider = 'ollama'
    stubFetch(replied({ error: 'model "nope" not found' }))
    await expect(getProvider().complete(ask)).rejects.toThrow(/not found/)
  })

  it('throws rather than returning an empty string when the stream had no content', async () => {
    config.llm.provider = 'openrouter'
    stubFetch(streamed(['data: {"choices":[{"delta":{}}]}\n', 'data: [DONE]\n']))
    await expect(collect(getProvider().stream(ask))).rejects.toThrow(/no content/)
  })
})

describe('a corrupt frame', () => {
  it('costs one delta, not the whole answer', async () => {
    config.llm.provider = 'openrouter'
    stubFetch(
      streamed([
        'data: {"choices":[{"delta":{"content":"before "}}]}\n',
        'data: not json at all\n',
        'data: {"choices":[{"delta":{"content":"after"}}]}\n',
        'data: [DONE]\n',
      ])
    )
    const out = await collect(getProvider().stream(ask))
    expect(out.map((d) => d.text).join('')).toBe('before after')
  })
})
