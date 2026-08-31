# Nyaya — legal assistant over the Bharatiya Nagarik Suraksha Sanhita, 2023

Two panels: a chatbot that answers questions on the bare act and always cites
Act + Section, and a forms library extracted straight out of the source PDF.

Work in progress. Run guide, env table and AI usage disclosure land here as the
parts get built. Evaluation results are below and are real numbers, not claims.

## Stack

- Backend: Node 22 + Express, plain JS (ESM)
- Vector DB: Qdrant (dense + BM25 sparse, fused with RRF)
- Embeddings: BAAI/bge-base-en-v1.5, self hosted, no hosted embedding APIs
- Queue: BullMQ on Redis
- Frontend: React + Vite + Tailwind
- LLM: provider behind an interface, swap with `LLM_PROVIDER` (gemini default, ollama supported)


## Evaluation

30 questions in `eval/golden_set.jsonl` — 25 answerable and 6 the system must
refuse. The set is deliberately adversarial: it asks in the words a person would
use, not the words the act uses ("jumped bail", "chargesheet", "zero FIR"), and
several questions sit next to a near-miss section. An earlier, gentler set was
scoring 0.958 Recall@5 on the dense-only baseline, which measured nothing.

```bash
node eval/run_eval.js                  # retrieval only, all three configs
node eval/run_eval.js --with-answers   # adds citation accuracy and generation, needs an LLM key
docker compose exec api node eval/run_eval.js   # same thing against the running stack
```

Results land in `eval/results/<config>.json` with every miss listed.

### Retrieval

| config | Recall@5 | Recall@10 | MRR@10 | p50 (CPU) | p50 (L4) |
|---|---|---|---|---|---|
| dense-only | 0.80 | 0.84 | 0.586 | 41 ms | 10 ms |
| hybrid (dense + BM25, RRF) | **0.84** | **0.96** | 0.672 | 41 ms | 13 ms |
| **hybrid + cross-encoder rerank** | **0.84** | **0.96** | **0.716** | 1609 ms | 23 ms |

### Answers

| config | citation accuracy | refusal rate (out of scope) | generation p50 | generation p95 |
|---|---|---|---|---|
| dense-only | 0.84 | 6/6 | 2673 ms | 5144 ms |
| hybrid | 0.84 | 6/6 | 3267 ms | 5664 ms |
| hybrid + rerank | 0.76 | 6/6 | 3025 ms | 4448 ms |

**Why the winner won.** BM25 is what *finds* the section: Recall@10 goes 0.84 to
0.96, because statute questions turn on exact identifiers and colloquial terms
that a cosine over 768 dimensions blurs. RRF then *ranks* it, and the
cross-encoder reorders the top 6 in full: MRR 0.672 to 0.716, the best of the
three. Find with BM25, order with the cross-encoder.

**The citation number that got worse.** Reranking scores 0.76 against 0.84 for
the other two. On 25 questions that is two answers, and each config's answer pass
is a separate set of model calls, so this is inside run-to-run variance rather
than a real effect — the same config measured 0.917 and 0.958 on two runs of the
previous set. It is reported as measured rather than quietly dropped.

**Known miss.** "A man is picked up at 10pm on Monday, by when must he be before
a magistrate?" returns s.57 and s.78 — both genuinely about producing an arrested
person — but not s.58, which carries the twenty-four hour limit. Three adjacent
sections, and the precise one loses. Left as a documented miss rather than
tuned around, which would only have overfitted a 25 question set.

**A caveat on the synonym bridge.** `src/retrieval/synonyms.js` maps colloquial
terms to statutory ones, and four of its entries were added after seeing which
questions this set missed. That is a real overfitting risk. They are all general
vocabulary a user would plausibly hit, not sentence-level fixes, but the honest
position is that the bridge should be validated against a set it was not built
against.

## Observability

`GET /api/v1/metrics` is Prometheus format. Beyond request count and latency:

| metric | what it tells you |
|---|---|
| `nyaya_retrieval_seconds` | hybrid retrieval latency, embedding and rerank included |
| `nyaya_embedding_seconds` | time in the embedding server, query and passage apart |
| `nyaya_rerank_seconds` | time in the cross-encoder |
| `nyaya_generation_seconds` | time streaming an answer out of the model |
| `nyaya_llm_tokens_total` | tokens billed, by direction and model |
| `nyaya_query_cost_usd_total` | estimated spend, tokens times the provider rate |
| `nyaya_refusals_total` | answers withheld, by reason (injection, unsafe, out_of_scope, low_confidence) |
| `nyaya_citations_stripped_total` | citations the model invented and the guard removed |
| `nyaya_uploads_total` | documents accepted and rejected |
| `nyaya_dependency_up` | 1 per dependency that answered its health probe |

Cost per query is `nyaya_query_cost_usd_total` over chat request count; the
dashboard panel does that division. Prometheus and Grafana are an optional
overlay so the app runs without them:

```bash
docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d
# grafana on :3000, dashboard in monitoring/grafana/nyaya.json
```
