# Module contracts

Plain JS ESM. Every module here is imported by the API layer. Keep signatures exact.

## src/llm/provider.js

```js
export function getProvider()           // reads config.llm.provider
// provider object:
{
  name: 'gemini',
  async *stream({ system, messages, temperature, maxTokens, signal }),  // yields { text } deltas
  async complete({ system, messages, temperature, maxTokens, signal }), // -> { text, usage }
  countTokens(text),                                                    // rough is fine
}
```

`messages` is `[{ role: 'user'|'assistant', content: string }]`. Usage is
`{ input_tokens, output_tokens }`. Providers: gemini, openrouter, groq, ollama.
Swappable by `LLM_PROVIDER` alone — no other code may branch on provider name.

## src/llm/guards/input.js

```js
export async function checkInput({ message, history, documentText })
// -> { allow, reason, category, rewritten }
```

Categories: `ok`, `injection`, `out_of_scope`, `unsafe`. Runs the cheap model
(SLM) for classification. Must catch prompt injection coming from an uploaded
document, not just the user message.

## src/llm/guards/output.js

```js
export function validateCitations({ answer, contexts })
// -> { text, citations, stripped, invented_in_prose, valid }
```

Pure and synchronous. Detection is two stage: anything bracket shaped that looks
like a citation is a candidate, then each candidate is parsed strictly. A
candidate that does not parse to exactly one section present in `contexts` is
stripped, so a marker the model improvised (`[BNSS s.103 and s.999]`) cannot pass
by not matching the regex. The act is checked too, BNS is not BNSS. Sections named
in plain prose are checked as well and land in `invented_in_prose`. A subsection
marker binds to the chunk that actually holds that subsection.

This is a code guard, not a prompt instruction.

```js
export function shouldRefuse({ results, threshold })  // -> boolean
```

Keys off `dense_score`, the cosine from the dense leg. RRF ranks rather than
measures, and BM25 is unbounded, so neither can be compared against a threshold.
Default 0.58, measured on this corpus: in scope questions land 0.62-0.80, out of
scope 0.37-0.53.

## src/retrieval/query.js

```js
export async function transformQuery({ message, history })
// -> { search: string, hyde: string|null, standalone: string, intent }
```

`standalone` resolves pronouns against history ("what about its proviso?" ->
"what is the proviso to section 35 BNSS?"). `hyde` is a short hypothetical
statutory passage used for the dense leg only. `intent` is one of
`section_lookup`, `concept`, `document`, `out_of_scope`.

## src/retrieval/hybrid.js (owned by the main session, do not write this file)

```js
export async function retrieve({ query, hyde, filters, topK, sessionId, documentIds, mode })
// -> { results: [Citation], route, took_ms }
```

`Citation` shape is in docs/api-contract.md.
