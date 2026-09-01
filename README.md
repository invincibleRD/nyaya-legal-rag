# Nyaya — a legal assistant over the Bharatiya Nagarik Suraksha Sanhita, 2023

Two panels. A chat that answers questions on the bare act and cites Act + Section
for every claim, and a forms library extracted straight out of the source PDF.

**Live:** https://hrn.ultronai.me · **API docs:** https://hrn.ultronai.me/docs

> **The supplied PDF is not the BNS.** It is the **Bharatiya Nagarik Suraksha
> Sanhita (BNSS), 2023 — Act 46 of 2023**, the criminal _procedure_ code. Their
> stated forms range (pages 190–249) matches this exact file, so the page numbers
> in the brief were built against it; only the act _name_ is wrong. The
> consequence bites: substantive offences and punishments live in the BNS, so the
> brief's own sample question ("punishment for culpable homicide") is
> unanswerable from this corpus, and refusing it is correct behaviour rather than
> a bug. Full reasoning in [DECISIONS.md](DECISIONS.md).

---

## 1. What has been implemented

Part by part against the brief. "Partial" means something real is missing, and it
is named.

### Part A — Retrieval & indexing (30%)

| Requirement                                                | State                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Structure-aware chunking, no naive splitter                | Done — 531 sections, 0 gaps, 643 act chunks                             |
| Section as the atomic unit                                 | Done — short sections are never split                                   |
| Split at subsection/clause, never mid-sentence             | Done — subsection → clause → sentence ladder                            |
| Provisos, exceptions, explanations, illustrations attached | Done — 156 proviso, 34 explanation, 10 illustration chunks              |
| Headers, footers, page numbers, marginal notes handled     | Done — coordinate-based, using x/y/height                               |
| Section number → title association                         | Done — all 531 titled from marginal notes                               |
| Cross-references stored                                    | Done — 289 chunks carry `references[]`                                  |
| Full metadata schema                                       | Done — act, chapter, section, subsection, pages, flags                  |
| Open-weight embeddings, self-hosted                        | Done — bge-base-en-v1.5 on TEI, no hosted embedding API                 |
| Query/passage prefix asymmetry                             | Done — query side only, in one function                                 |
| Hybrid dense + sparse, fused                               | Done — own BM25 in Qdrant sparse vectors, RRF at k=20                   |
| Metadata filtering                                         | Done — act/chapter/section, indexed                                     |
| Direct section lookup                                      | Done — regex intent, payload filter, bypasses cosine                    |
| Reranking                                                  | Done — `bge-reranker-base` cross-encoder over the top 6, full text      |
| First Schedule (offence classification) ingested           | Done — 441 entries, 0 bad cells of 467 rows                             |
| Statutory forms retrievable in chat                        | Done — 58 form chunks, indexed by the section they are prescribed under |
| Citation contract enforced in code                         | Done — two-stage validator, not a prompt instruction                    |
| Refusal below threshold                                    | Done — 0.58 cosine, measured not guessed                                |
| Post-generation validation                                 | Done — invented sections stripped from text and prose                   |
| Two corpora, session scoping                               | Done — another session's documents return zero results                  |
| Prompt injection from documents                            | Done — neutralised by sentence removal                                  |

### Part B — Forms pipeline (20%) — complete

| Requirement                                         | State                                                   |
| --------------------------------------------------- | ------------------------------------------------------- |
| One PDF per form, page-perfect vector               | Done — 58 files, text layer intact                      |
| Titles scraped, not hardcoded                       | Done — read from under each form number                 |
| Multi-page forms stay whole                         | Done — form 33 spans pages 222–224                      |
| `FORM-<n>_<slug>.pdf` naming                        | Done                                                    |
| `forms_manifest.json` with sha256, size, confidence | Done                                                    |
| `needs_review` flag                                 | Done — form 33 flagged (its title really is "CHARGES")  |
| OCR fallback                                        | Done — verified by forcing it; never fires on this file |
| Idempotent, byte-identical                          | Done — fixed PDF dates, verified across two runs        |

### Part C — Frontend & UX (20%)

| Requirement                                                  | State                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| Token streaming, no spinner-then-wall-of-text                | Done — SSE                                                  |
| Multi-turn with history, sidebar list, rename, delete        | Done — grouped Today / Yesterday / Previous 7 days          |
| Citations as chips, click opens the source drawer            | Done — exact statutory text, chapter, page, match score     |
| Drag-and-drop upload with parse → chunk → embed → ready      | Done — visible stage bar                                    |
| Markdown, code/quote blocks, copy, stop, regenerate          | Done                                                        |
| Empty state with example questions                           | Done — four, one per retrieval path                         |
| Useful error states                                          | Done — file too large, wrong type, timeout, empty retrieval |
| Searchable/filterable forms, preview, single + bulk download | Done                                                        |
| Fully responsive, usable on a phone                          | Done — verified at 390 px                                   |
| Keyboard accessible, visible focus, ARIA                     | Done                                                        |
| Dark + light mode                                            | Done                                                        |
| No layout shift when a long answer streams in                | Done — the action row is reserved, not appended             |

### Part D — Backend & API (15%)

| Endpoint                                                         | State                                           |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| `POST /api/v1/chat` (SSE, multi-turn)                            | Done                                            |
| `POST /api/v1/documents/upload`, `/{id}/status`, list, delete    | Done                                            |
| `GET /api/v1/conversations`, get, rename, delete                 | Done                                            |
| `POST /api/v1/search`                                            | Done                                            |
| `GET /api/v1/forms`, `/search`, `/{n}/download`, `/download-all` | Done                                            |
| `POST /api/v1/feedback`                                          | Done                                            |
| `GET /api/v1/health`, `/health/ready`, `/metrics`                | Done                                            |
| `/docs` OpenAPI                                                  | Done — Swagger UI, spec at `/docs/openapi.json` |
| Rate limiting                                                    | Done — per-IP and per-session, see §3           |
| Async ingestion with job status                                  | Done — BullMQ worker                            |
| Structured logs with request id                                  | Done — pino                                     |
| Dockerfile, non-root, healthcheck                                | Done                                            |
| `docker compose up` brings the whole system up                   | Done — plus a GPU overlay                       |

### Part E — CI/CD (15%)

Lint, format, tests with a 60% coverage gate, gitleaks, Docker build to GHCR
tagged by SHA, Trivy failing on fixable CRITICALs, deploy on `main`, and a
retrieval job on a self-hosted runner. Fork PRs are gated off the self-hosted
runner. `docs/self-hosted-runner.md` covers registration, systemd, token
rotation, the fork-PR attack and rollback.

Coverage is 63% against the 60% floor. It used to fail at ~35% because
corpus-dependent tests self-skip without the PDF; the fix was a generated
fixture PDF with real gazette geometry, not a lowered number.

### Part F — Evaluation & observability (10%)

| Requirement                                                 | State                                             |
| ----------------------------------------------------------- | ------------------------------------------------- |
| Golden set, 25–30 questions                                 | Done — 31, of which 6 must be refused             |
| Recall@5/@10, MRR, citation accuracy, refusal rate, latency | Done — §7                                         |
| Two configurations compared                                 | Done — three: dense-only, hybrid, hybrid + rerank |
| Prometheus metrics                                          | Done — 10 domain series beyond HTTP               |
| Grafana dashboard                                           | Done — `monitoring/grafana/nyaya.json`            |
| Cost per query                                              | Done — `nyaya_query_cost_usd_total`               |

---

## 2. How to start the project

From a clean clone, on a machine with Docker and Docker Compose. Nothing else is
required — Node, Python and the model weights all live inside containers.

```bash
git clone https://github.com/invincibleRD/nyaya-legal-rag.git
cd nyaya-legal-rag

cp .env.example .env
# put a key in GEMINI_API_KEY, or switch to Ollama — see §4
$EDITOR .env

docker compose up -d --build     # ~5 min cold, mostly the TEI model pull
./scripts/bootstrap.sh           # forms extraction + ingestion, idempotent
```

The corpus PDF is committed at `data/raw/bnss-2023.pdf`, so bootstrap has nothing
to download. It waits for Qdrant and the embedding server, extracts the 58 forms,
then ingests the act. Re-running it is safe: the forms extractor is byte-identical
on a second pass, and ingestion upserts by a stable chunk id rather than appending.

| Service           | URL                                  | What it is                           |
| ----------------- | ------------------------------------ | ------------------------------------ |
| App               | http://localhost:5173                | the two-panel UI                     |
| API               | http://localhost:8000/api/v1         |                                      |
| API docs          | http://localhost:8000/docs           | Swagger UI                           |
| Vector DB console | http://localhost:6333/dashboard      | Qdrant                               |
| Metrics           | http://localhost:8000/api/v1/metrics | Prometheus format                    |
| Grafana           | http://localhost:3000                | only with the monitoring overlay, §7 |

Every port is bound to `127.0.0.1`, not `0.0.0.0`. Nothing is reachable off the
box unless you put a reverse proxy in front of it.

**Images:** backend 463 MB, frontend 48.6 MB. The backend is Node 22 on
`bookworm-slim` with no CUDA in it — inference happens in the TEI containers, so
the app image stays small whether you run on CPU or GPU.

**GPU.** `docker-compose.gpu.yml` moves the embedder and reranker onto an NVIDIA
card. It needs `nvidia-container-toolkit` on the host, and `TEI_GPU_TAG` set for
your compute capability (`86` Ampere, `89` Ada/L4):

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

Retrieval p50 goes from 1609 ms on CPU to 23 ms on an L4.

---

## 3. Environment variables

Everything has a working default in `.env.example`. Only `GEMINI_API_KEY` has to
be filled in, and even that is optional if you use Ollama.

### Core

| Variable           | Default                 | What it does                                                                           |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `development`           |                                                                                        |
| `PORT`             | `8000`                  | API listen port                                                                        |
| `LOG_LEVEL`        | `info`                  | pino level                                                                             |
| `CORS_ORIGIN`      | `http://localhost:5173` | the single origin allowed to call the API                                              |
| `TRUST_PROXY_HOPS` | `0`                     | proxies in front of the app, counted from the socket inwards. Never `true` — see below |
| `PUBLIC_URL`       | `http://localhost:8000` | baked into the frontend bundle at build time                                           |

### Storage and inference

| Variable                 | Default                 | What it does                                                         |
| ------------------------ | ----------------------- | -------------------------------------------------------------------- |
| `QDRANT_URL`             | `http://qdrant:6333`    |                                                                      |
| `STATUTE_COLLECTION`     | `bnss_statute`          | the act, shared by everyone                                          |
| `DOCS_COLLECTION`        | `user_docs`             | uploads, filtered by session on every query                          |
| `REDIS_URL`              | `redis://redis:6379`    | sessions, queue, rate-limit counters                                 |
| `REDIS_ENABLED`          | `true`                  | `false` falls every Redis-backed limit back to an in-process counter |
| `EMBEDDING_URL`          | `http://embeddings:80`  | TEI                                                                  |
| `EMBEDDING_MODEL`        | `BAAI/bge-base-en-v1.5` | open weights, self-hosted                                            |
| `EMBEDDING_DIM`          | `768`                   | must match the model                                                 |
| `EMBEDDING_QUERY_PREFIX` | _(bge instruction)_     | queries only; passages go in raw                                     |
| `EMBEDDING_BATCH_SIZE`   | `32`                    |                                                                      |
| `TEI_GPU_TAG`            | `86-1.7`                | only read by the GPU overlay                                         |
| `RERANK_ENABLED`         | `true`                  |                                                                      |
| `RERANKER_URL`           | `http://reranker:80`    |                                                                      |
| `RERANK_POOL`            | `6`                     | candidates the cross-encoder sees                                    |
| `RERANK_MAX_CHARS`       | `1800`                  | truncating below this is what destroys quality                       |

### Model

| Variable                             | Default               | What it does                                   |
| ------------------------------------ | --------------------- | ---------------------------------------------- |
| `LLM_PROVIDER`                       | `gemini`              | `gemini` \| `openrouter` \| `groq` \| `ollama` |
| `LLM_MODEL`                          | `gemini-3.6-flash`    |                                                |
| `GEMINI_API_KEY`                     | —                     | required unless you switch provider            |
| `OPENROUTER_API_KEY`, `GROQ_API_KEY` | —                     |                                                |
| `OLLAMA_URL`                         | `http://ollama:11434` |                                                |

### Retrieval

| Variable                        | Default | What it does                                                                                                                       |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `RETRIEVAL_TOP_K`               | `8`     | passages handed to the model                                                                                                       |
| `CANDIDATE_POOL`                | `40`    | per leg, before fusion                                                                                                             |
| `RRF_K`                         | `20`    | 60 barely separates rank 1 from rank 10 on this corpus                                                                             |
| `CONFIDENCE_THRESHOLD`          | `0.58`  | below this it refuses. In-scope measures 0.62–0.80, out-of-scope 0.37–0.53                                                         |
| `DOCUMENT_CONFIDENCE_THRESHOLD` | `0.38`  | the same gate for an uploaded file, which is in scope by the user's choice. Measured: answerable 0.44–0.61, unanswerable 0.29–0.30 |

### Abuse limits

The app has **no authentication** and is deployed publicly with a paid API key
behind it, so the limits below are load-bearing rather than decorative.

The session id is chosen by the client, so a per-session limit is a courtesy, not
a control — an attacker rotates it per request. **The budget that actually holds
is per client IP**, which requires `TRUST_PROXY_HOPS` to be correct. Set it to
the real number of proxies; `true` would let any client forge `X-Forwarded-For`
and mint themselves a fresh bucket. In production here the chain is GCLB → nginx
→ app, and the client IP is 3 hops in.

| Variable                                  | Default | What it does                                                         |
| ----------------------------------------- | ------- | -------------------------------------------------------------------- |
| `MAX_UPLOAD_MB`                           | `25`    |                                                                      |
| `GLOBAL_RATE_LIMIT_PER_MIN`               | `300`   | per IP, across all of `/api/v1`                                      |
| `CHAT_RATE_LIMIT_PER_IP_PER_MIN`          | `10`    |                                                                      |
| `SEARCH_RATE_LIMIT_PER_IP_PER_MIN`        | `20`    | GPU embed + cross-encoder on every call                              |
| `UPLOAD_RATE_LIMIT_PER_IP_PER_HOUR`       | `10`    |                                                                      |
| `DOWNLOAD_ALL_RATE_LIMIT_PER_IP_PER_HOUR` | `3`     | ~29 MB of zip per call                                               |
| `CHAT_RATE_LIMIT_PER_MIN`                 | `20`    | per session, UX only                                                 |
| `UPLOAD_RATE_LIMIT_PER_HOUR`              | `10`    | per session, UX only                                                 |
| `MAX_CONCURRENT_CHAT_PER_IP`              | `2`     | simultaneous open streams, which a per-minute counter cannot see     |
| `MAX_CONCURRENT_CHAT_TOTAL`               | `12`    |                                                                      |
| `MAX_CONVERSATIONS_PER_SESSION`           | `50`    | stops one session filling Redis                                      |
| `MAX_DOCUMENTS_PER_SESSION`               | `20`    |                                                                      |
| `DAILY_COST_CEILING_USD`                  | `5`     | rolling UTC day. Chat returns 503 above it; `0` disables the breaker |

### Corpus and cost

| Variable                                   | Default                       | What it does                    |
| ------------------------------------------ | ----------------------------- | ------------------------------- |
| `DATA_DIR`                                 | `/app/data`                   |                                 |
| `SOURCE_PDF`                               | `/app/data/raw/bnss-2023.pdf` | committed in the repo           |
| `SOURCE_URI`                               | _(Drive link)_                | only used if the PDF is missing |
| `FORMS_PAGE_START` / `FORMS_PAGE_END`      | `190` / `249`                 |                                 |
| `COST_PER_1M_INPUT` / `COST_PER_1M_OUTPUT` | `0.10` / `0.40`               | drives the cost gauge           |

---

## 4. Running with Ollama, no API key

The provider sits behind an interface, so this is two variables and a container.

```bash
docker run -d --name ollama -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
docker exec ollama ollama pull llama3.1:8b
```

In `.env`:

```ini
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1:8b
OLLAMA_URL=http://host.docker.internal:11434   # or http://172.17.0.1:11434 on Linux
```

Then `docker compose up -d --build api worker`.

Embeddings and reranking never used a hosted API in the first place — they run in
the TEI containers either way — so nothing else changes. Answer quality drops
relative to Gemini, but the citation guard, the refusal threshold and the eval
all work identically, which is the point: you can grade the retrieval without a
key of ours.

---

## 5. Ingestion and forms extraction

`./scripts/bootstrap.sh` does both, and is the documented one-shot path. The two
halves also run on their own:

```bash
# inside the running stack
docker compose exec api npm run extract-forms   # 58 PDFs + forms_manifest.json
docker compose exec api npm run ingest          # act + First Schedule -> Qdrant

# or on the host, with the stack's ports exposed
cd backend && npm ci
QDRANT_URL=http://localhost:6333 EMBEDDING_URL=http://localhost:8081 npm run ingest
```

Both are idempotent. Extraction is byte-identical on a rerun (PDF creation dates
are pinned); ingestion upserts on a stable chunk id, so re-running replaces
rather than duplicates. Forms land in `data/forms/`, and ingestion writes the
BM25 statistics to `data/bm25-<collection>.json` — if that file is missing the
sparse leg silently cannot run, so the retriever logs a warning rather than
quietly degrading to dense-only.

---

## 6. API usage

Copy-pasteable. Swap the host for https://hrn.ultronai.me to hit the deployment.

```bash
# ask a question — SSE, so watch the frames arrive
curl -N -X POST http://localhost:8000/api/v1/chat \
  -H 'content-type: application/json' \
  -H 'x-session-id: demo-session-1' \
  -d '{"message":"Can the police arrest someone without a warrant?"}'
```

```bash
# retrieval on its own, no model call
curl -s -X POST http://localhost:8000/api/v1/search \
  -H 'content-type: application/json' \
  -d '{"query":"grounds for anticipatory bail","top_k":5}' | jq '.results[] | {section_number, score}'
```

```bash
# upload a PDF, then poll until it is queryable
curl -s -X POST http://localhost:8000/api/v1/documents/upload \
  -H 'x-session-id: demo-session-1' -F 'file=@/path/to/case.pdf'

curl -s http://localhost:8000/api/v1/documents/<document_id>/status \
  -H 'x-session-id: demo-session-1'
```

```bash
# forms
curl -s http://localhost:8000/api/v1/forms | jq '.forms | length'          # 58
curl -s 'http://localhost:8000/api/v1/forms/search?q=bail' | jq '.forms[].title'
curl -sO -J http://localhost:8000/api/v1/forms/2/download                  # one form
curl -sO -J http://localhost:8000/api/v1/forms/download-all                # 29 MB zip

# ops
curl -s http://localhost:8000/api/v1/health/ready | jq
curl -s http://localhost:8000/api/v1/metrics | head -20
```

The full contract, with every request and response shape and the SSE event order,
is at `/docs`.

---

## 7. Tests, eval, and results

```bash
cd backend
npm test              # 231 tests
npm run test:cov      # coverage, 60% floor enforced in CI
```

Tests that need the real corpus, a live Qdrant or an LLM key **skip rather than
fail**, so a clean clone with no key still goes green. The chunker is covered
without the corpus by a generated fixture PDF that reproduces the gazette's
geometry.

```bash
node eval/run_eval.js                  # retrieval only, all three configs
node eval/run_eval.js --with-answers   # adds citation accuracy + generation, needs a key
docker compose exec api node eval/run_eval.js   # against the running stack
```

Results land in `eval/results/<config>.json` with every miss listed by name.

31 questions in `eval/golden_set.jsonl` — 25 answerable and 6 the system must
refuse. The set is deliberately adversarial: it asks in the words a person would
use rather than the words the act uses ("jumped bail", "chargesheet", "zero
FIR"), and several questions sit next to a near-miss section. An earlier, gentler
set scored 0.958 Recall@5 on the dense-only baseline, which measured nothing.

### Retrieval

| config                            | Recall@5 | Recall@10 | MRR@10    | p50 (CPU) | p50 (L4) |
| --------------------------------- | -------- | --------- | --------- | --------- | -------- |
| dense-only                        | 0.80     | 0.84      | 0.586     | 41 ms     | 10 ms    |
| hybrid (dense + BM25, RRF)        | **0.84** | **0.96**  | 0.672     | 41 ms     | 13 ms    |
| **hybrid + cross-encoder rerank** | **0.84** | **0.96**  | **0.765** | 1609 ms   | 24 ms    |

### Answers

| config          | citation accuracy | refusal rate (out of scope) | generation p50 | generation p95 |
| --------------- | ----------------- | --------------------------- | -------------- | -------------- |
| dense-only      | 0.84              | 6/6                         | 2673 ms        | 5144 ms        |
| hybrid          | 0.84              | 6/6                         | 3267 ms        | 5664 ms        |
| hybrid + rerank | 0.76              | 6/6                         | 3025 ms        | 4448 ms        |

**Why the winner won.** BM25 is what _finds_ the section: Recall@10 goes 0.84 to
0.96, because statute questions turn on exact identifiers and colloquial terms
that a cosine over 768 dimensions blurs. RRF then _ranks_ it, and the
cross-encoder reorders the top 6 in full: MRR 0.672 to 0.765, the best of the
three. Find with BM25, order with the cross-encoder.

**The cross-encoder needs the synonym bridge too.** It first measured 0.716, and
the gap was that `expandQuery` ran on the sparse leg only — BM25 searched for the
statutory words while the cross-encoder was still re-reading the user's
colloquial ones. Measured straight against the reranker: "grounds for
anticipatory bail" scored the correct passage (s.482(1), "person apprehending
arrest") at **0.0031** and lost to a near miss at 0.0068; through the bridge that
same passage scores **0.9805**. The phrase "anticipatory bail" appears nowhere in
the BNSS, which is the whole reason the bridge exists. Routing the reranker query
through it moved s.482(1) from rank 5 to rank 1, and MRR@10 from 0.716 to 0.765
with recall unchanged.

**The citation number that got worse.** Reranking scores 0.76 against 0.84 for
the other two. On 25 questions that is two answers, and each config's answer pass
is a separate set of model calls, so this sits inside run-to-run variance rather
than being a real effect — the same config measured 0.917 and 0.958 on two runs
of the previous set. Reported as measured rather than quietly dropped.

**Known miss.** "A man is picked up at 10pm on Monday, by when must he be before
a magistrate?" returns s.57 and s.78 — both genuinely about producing an arrested
person — but not s.58, which carries the twenty-four hour limit. Three adjacent
sections, and the precise one loses. Left as a documented miss rather than tuned
around, which would only have overfitted a 25-question set.

**A caveat on the synonym bridge.** `backend/src/retrieval/synonyms.js` maps
colloquial terms to statutory ones, and four of its entries were added after
seeing which questions this set missed. That is a real overfitting risk. They are
general vocabulary a user would plausibly hit rather than sentence-level fixes,
but the honest position is that the bridge should be validated against a set it
was not built against.

### Observability

`GET /api/v1/metrics` is Prometheus format. Beyond request count and latency:

| metric                           | what it tells you                                       |
| -------------------------------- | ------------------------------------------------------- |
| `nyaya_retrieval_seconds`        | hybrid retrieval latency, embedding and rerank included |
| `nyaya_embedding_seconds`        | time in the embedding server, query and passage apart   |
| `nyaya_rerank_seconds`           | time in the cross-encoder                               |
| `nyaya_generation_seconds`       | time streaming an answer out of the model               |
| `nyaya_llm_tokens_total`         | tokens billed, by direction and model                   |
| `nyaya_query_cost_usd_total`     | estimated spend, tokens times the provider rate         |
| `nyaya_refusals_total`           | answers withheld, by reason                             |
| `nyaya_citations_stripped_total` | citations the model invented and the guard removed      |
| `nyaya_uploads_total`            | documents accepted and rejected                         |
| `nyaya_dependency_up`            | 1 per dependency that answered its health probe         |

Cost per query is `nyaya_query_cost_usd_total` over chat request count; the
dashboard panel does that division. Prometheus and Grafana are an optional
overlay so the app runs without them:

```bash
docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d
# grafana on :3000, dashboard in monitoring/grafana/nyaya.json
```

---

## 8. AI usage disclosure

**Roughly 80% of the lines in this repo were written by an AI tool.** The
architecture, the corpus finding, the debugging and every judgment call about
what to keep were mine. I am disclosing the split honestly because I can explain
any file in here, which is the part that matters.

### Which tools

- **Claude Code (Claude Opus)** — the primary tool, and effectively all of the
  generated code. Used for the Express API, the React components, the Docker and
  Compose setup, the CI workflow, the test suite, and the first drafts of these
  documents.
- **ChatGPT** — occasional rubber-ducking on Qdrant's sparse-vector API and on
  RRF, where I wanted a second explanation before committing to an approach.
- No Cursor, Copilot or Windsurf.

### Representative prompts

Paraphrased, not transcripts:

1. "Chunk this bare act so a section is the atomic unit; split at subsection then
   clause then sentence, never mid-sentence, and attach provisos and explanations
   to their parent."
2. "The marginal notes are the section titles. Use the pdfjs text coordinates —
   x, y and height — to tell a marginal note from body text, and drop running
   headers and page numbers."
3. "Implement BM25 across Qdrant sparse vectors: saturation on the document side
   at index time, IDF on the query side at search time."
4. "Write a citation validator that runs in code, not in the prompt. Every
   `[BNSS s.N]` in the answer must exist in the retrieved context, or it gets
   stripped from both the markers and the prose."
5. "Pages 158–189 are a six-column table. Parse it by x position and handle runs
   the typesetter ran across a column boundary."
6. "Build a golden set of 31 BNSS procedure questions, at least 5 that must be
   refused, phrased the way a person would ask rather than the way the act is
   written."
7. "The rate limiter keys on a client-supplied session header. Close that, key
   the real budget on client IP, and get `trust proxy` right so
   `X-Forwarded-For` can't be forged."

**How I refined one.** The first chunker prompt produced a recursive character
splitter with overlap — exactly the naive approach the brief rules out. The
second attempt, told to use the section as the atomic unit, still split
mid-sentence on long sections. What actually worked was giving it the ladder
explicitly (subsection → clause → sentence, in that order, and never below) and a
character budget that accounts for the heading it prepends. That third version is
what ships.

### Where manual work was needed

This is the honest list, and it is where the tool stopped being useful:

- **The corpus identification.** No model told me the PDF was the BNSS rather
  than the BNS. I found it by reading the act's own long title and cross-checking
  the forms page range against the brief. Everything downstream — the golden set
  built from procedure, refusing offence questions as correct behaviour, tagging
  First Schedule rows as BNS — follows from that one observation, and it was
  entirely manual.
- **Every empirical constant.** RRF `k`, the reranker pool size, the 0.58
  threshold and the First Schedule column boundaries were all wrong when
  generated and right only after measurement. The model confidently produced
  `k=60` (the paper's default, far too flat here), a reranker pool of 12 with
  truncated passages (worse than 6 with full text), and a column boundary of 282
  that split "Imprisonment for 2 years," across two cells. I found each by
  measuring, not by reading the code.
- **The citation guard bug the eval caught.** The validator was stripping
  _correct_ citations because its regex didn't tolerate the page suffix the
  prompt asks the model to emit — `[BNSS s.63, p.191]` was being deleted, leaving
  answers uncited. Code review missed it twice; the eval caught it, and accuracy
  went 0.875 → 0.958. The lesson I took: measurement finds what review doesn't.
- **A test suite that measured nothing.** Three tests passed against a stubbed
  function, and a retrieval test "passed" at exactly the dense-only recall number
  because missing BM25 statistics made the sparse leg silently skip. Both were
  generated code that looked correct. I now make the degraded path log a warning
  and the test skip rather than quietly pass.
- **Security.** The rate limiting was generated keyed on a client-supplied
  session header, which is no limit at all. Recognising that the session id
  cannot be a security boundary, and that `trust proxy: true` would let anyone
  forge their own IP bucket, was mine.
- **Small but real.** The model invented a `trivy-action` version tag twice
  before I made it query the actual tag list; and a scripted edit silently
  matched nothing and shipped a broken import path, which is why edits now assert
  they matched.

There is no penalty in the brief for heavy AI use, and I have not tried to
minimise mine. The parts I would defend in an interview are the corpus finding,
the retrieval measurements, and knowing which generated code was lying to me.

---

## 9. What's incomplete

Specific, not hedged.

- **The s.58 miss** described in §7 is still a miss. Two adjacent sections that
  are genuinely responsive come back instead of the precise one.
- **Citation subsection binding.** `[BNSS s.35(1)]` binds to a chunk whose text
  begins mid-clause-list, at "(j)". The guard correctly refuses to invent a
  subsection it can't evidence, but the drawer then shows a passage that starts
  in an odd place. Fixing it properly means splitting s.35 differently, which
  would change chunk ids across the corpus.
- **The synonym bridge is not validated** against a held-out set, and four of its
  entries were written after seeing the misses. §7 says so; it is the single
  weakest number in this README.
- **First Schedule Part II** (the general classification rules, as opposed to the
  per-section rows) is not ingested. "Is section 351 bailable" works; "what makes
  an offence cognizable in general" falls back to the act text.
- **The worker container reports `unhealthy`** in `docker ps`. It inherits the
  API image's HTTP healthcheck while serving no HTTP — the queue itself works.
  The healthcheck is now disabled on that service, but the underlying tidier fix
  is a real worker liveness probe.
- **`docs/api-contract.md` has drifted** from the code: it documents
  `dense_rank`/`sparse_rank` on search results, which the API does not return.
  `/docs` is generated against the code and is correct; the markdown is stale.
- **No authentication.** Sessions are anonymous and client-declared by design.
  The abuse controls in §3 are IP-based because of it, which is the right control
  for a public demo but not what a real deployment would ship.
- Known bugs are listed in full, including the ones I would rather not mention,
  in [DECISIONS.md](DECISIONS.md) under "What I know is broken".

---

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — diagram, request lifecycles for an upload,
  a statute question and a document question, chunking schema, retrieval flow
- [DECISIONS.md](DECISIONS.md) — every meaningful trade-off, what I'd do with two
  more weeks, and what I know is broken
- `docs/self-hosted-runner.md` — runner registration, systemd, token rotation,
  the fork-PR attack surface, rollback
- `docs/module-contracts.md` — the internal interfaces

## Stack

Node 22 + Express (plain JS, ESM) · Qdrant, dense + BM25 sparse, fused with RRF ·
BAAI/bge-base-en-v1.5 and bge-reranker-base, self-hosted on TEI · BullMQ on Redis ·
React + Vite + Tailwind · LLM behind an interface, `LLM_PROVIDER` swaps it.
