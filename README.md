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

30 questions in `eval/golden_set.jsonl` — 24 answerable (7 lookup, 17 reasoning)
and 6 the system must refuse. Each answerable question names the section(s) a
correct answer has to rest on.

```bash
node eval/run_eval.js                  # retrieval only, all three configs
node eval/run_eval.js --with-answers   # adds citation accuracy and generation, needs an LLM key
node eval/run_eval.js --config=hybrid  # one config
```

Results land in `eval/results/<config>.json`, including every miss, so a
regression is diffable rather than a vibe.

### Retrieval

| config | Recall@5 | Recall@10 | MRR@10 | p50 | p95 |
|---|---|---|---|---|---|
| dense-only | 0.958 | 0.958 | 0.885 | 27 ms | 55 ms |
| hybrid (dense + BM25, RRF) | 0.958 | **1.000** | 0.837 | 30 ms | 43 ms |
| **hybrid + cross-encoder rerank** | **1.000** | **1.000** | **0.906** | 1488 ms | 1916 ms |

### Answers

| config | citation accuracy | refusal rate (out of scope) | generation p50 | generation p95 |
|---|---|---|---|---|
| dense-only | 0.833 | 1.000 | 2948 ms | 5160 ms |
| hybrid | 0.958 | 1.000 | 3082 ms | 4987 ms |
| **hybrid + rerank** | **0.958** | **1.000** | 2941 ms | 4842 ms |

**Why the winner won.** The two legs do different jobs. Adding BM25 to the dense
leg is what *finds* the right section — Recall@10 goes 0.958 to 1.000 and
citation accuracy 0.833 to 0.958, because statute questions are full of exact
identifiers that a cosine over 768 dimensions blurs. But RRF then *ranks* worse
than dense alone (MRR 0.885 down to 0.837), since fusing by rank position throws
away the dense leg's confidence. The cross-encoder reads query and passage
together and repairs exactly that: Recall@5 0.958 to 1.000 and MRR back up to
0.906, the best of the three. Find with BM25, order with the cross-encoder.

Citation accuracy counts an answer as correct only if the output guard stripped
nothing *and* at least one cited section is one the golden set expected. All
three configs refuse 6 of 6 out-of-scope questions.

The 1488 ms retrieval p50 is the cross-encoder on a laptop CPU. On the deployed
box (NVIDIA L4) the same reranker runs in 4–6 ms and full retrieval is ~40 ms —
the model is the same, only the hardware differs.

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
