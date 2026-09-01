# Decisions

`ARCHITECTURE.md` says what the system is. This file says why it is that way,
what each choice cost, and what is still wrong with it. Every number here was
measured on this repo; where a measurement is weak I say so.

## 1. The supplied corpus is not the BNS

The PDF handed out with the brief is the **Bharatiya Nagarik Suraksha Sanhita
(BNSS), 2023 — Act 46 of 2023**, the criminal _procedure_ code. It is not the
Bharatiya Nyaya Sanhita. 249 pages, sha256 `5e60e2af…`, laid out like this:

| Pages   | Content                                          |
| ------- | ------------------------------------------------ |
| 1–157   | Sections 1 to 531, the operative act             |
| 158–189 | First Schedule, the offence classification table |
| 190–249 | Second Schedule, 58 statutory forms              |

The brief's own forms page range, 190–249, matches this file exactly, so the page
numbers in the brief were built against this same PDF and only the act _name_ is
wrong. I took the file as authoritative and the name as a typo rather than going
and fetching a different act.

This changes what the system can honestly do. Substantive offences and their
punishments live in the BNS and are not in this corpus, so the brief's own sample
question — the punishment for culpable homicide — is **unanswerable from the
supplied file**, and a system that answers it is hallucinating. Consequences:

- The refusal path is a feature, not a fallback. Six golden-set questions must be
  refused, all three configurations refuse all six, and the answer prompt tells
  the model that offences live in the BNS so a refusal names the right act.
- The one place the BNS legitimately appears is the **First Schedule**. Pages
  158–189 are ingested (`src/ingestion/schedule.js`) and every row is a _BNS_
  section printed inside a BNSS gazette, so those chunks carry
  `act_short: 'BNS'` and cite as `[BNS s.351]`. That is what makes "is section
  351 bailable" answerable without pretending this act holds the offence.
- Both acts share one index, so "section 63" is ambiguous — a BNSS summons
  provision and a BNS offence. `detectSectionIntent` reads the act from the
  question, and a bare number defaults to BNSS, the act this corpus is.
- The golden set is built entirely from procedure. Anything else would measure a
  corpus I do not have.

## 2. Chunking: the section is the atomic unit

A statute is already chunked, by its draftsman. Discarding that for a fixed
character window would be the most damaging thing I could do here, for a reason
specific to legal text: the citation contract. Every chunk has to know which
section it came from, or the answer cannot cite it, the guard cannot validate the
citation, and the source drawer cannot show the passage a claim came from. A
naive splitter yields chunks with no section identity, and a proviso sitting in a
different chunk from the rule it qualifies — a proviso read without its rule
inverts the rule.

So `chunkSection` walks down a ladder and never below it: the whole section if it
fits in 1800 characters, else subsection `(1)`, else lettered clause `(a)`, else
sentence, and only if a single clause is still oversized. Provisos, Explanations,
Exceptions and Illustrations are re-attached to the block above them before
packing, so they are never orphaned.

1800 characters is set by the embedder, not by taste: bge-base-en-v1.5 truncates
at 512 tokens, and the chunk text is prefixed with a heading before embedding, so
the cap leaves room for that prefix.

Measured over the corpus: 531 sections with zero gaps in the sequence, all 531
titled, 643 statute chunks. Only 77 sections are long enough to split at all —
the other 454 are one chunk each, which is the point. 156 chunks carry a proviso,
34 an explanation, 10 illustrations, 289 carry cross-references pulled from their
own text.

Two parser rules earn those numbers. Section titles live in a marginal column and
are matched by coordinates and proximity to the heading, not by font size —
chapter headings are small too. And section starts are gated on sequence: only
the number that comes _next_ is accepted, which kills every mid-sentence "under
section 187" false positive.

## 3. Overlap: none in the statute, 150 characters in uploads

The brief leaves overlap to the candidate. The statute chunker uses **zero
overlap**, deliberately.

Overlap exists to stop a retrievable idea falling into the seam between chunks.
Here the seams are not arbitrary — they are subsection and clause boundaries the
draftsman put there, and a cut at one orphans nothing. What overlap would buy
instead is duplicated text across two chunks citing the _same_ section, which
hurts downstream: the diversity pass caps a section at 2 chunks in the top-k, so
two near-identical chunks eat both slots and push a different section out.

The redundancy overlap normally provides is supplied structurally instead. Every
chunk is embedded as `embed_text` — chapter title, `BNSS Section <n> - <title>`,
then the text. A fragment starting at clause `(c)` still carries "Processes To
Compel Appearance" and "Form of summons" into its vector, so it stays findable by
what it is about.

Uploaded documents get the opposite treatment: `chunkPages` targets 1500
characters with a **150 character overlap** cut at a word boundary. An arbitrary
user PDF has no reliable structure — often no paragraph marks at all, so breaks
are inferred from line spacing — and there a sentence split across a seam really
can become unfindable. Overlap where structure is absent, none where it exists.

## 4. Embeddings: bge-base-en-v1.5, self-hosted on TEI

The brief requires open weights, which rules out hosted embedding APIs anyway,
and I would have self-hosted regardless. The index is 1142 points; if a hosted
endpoint silently changes model version, every stored vector is stale and nothing
tells me. Ingestion embeds the corpus in batches of 32, the burst pattern hosted
APIs throttle and bill for. And the upload path embeds a user's own PDF, which is
better off not leaving the box.

`base` rather than `large` because everything had to run on a CPU laptop first;
768 dimensions is a real quality ceiling I accepted knowingly and never measured
against alternatives (§16). Text Embeddings Inference serves it, and the **same
image with a different model id** serves the reranker — one thing to operate, one
health check shape, one GPU overlay that moves both.

The bge family is asymmetric: queries want an instruction prefix, passages do
not. Getting that backwards degrades recall _silently_ — nothing errors, the
numbers are just worse. So the prefix lives in exactly one function, `withPrefix`
in `retrieval/embeddings.js`, applied only when `isQuery` is true. It is
configured as `EMBEDDING_QUERY_PREFIX`, and it had to be quoted in `.env` after
the unquoted colon broke shell sourcing — a small bug, but the kind that ships a
prefix-free deployment while every test still passes.

## 5. Hybrid over dense-only, and BM25 inside Qdrant

Measured on the golden set (README):

| config                     | Recall@5 | Recall@10 | MRR@10 |
| -------------------------- | -------- | --------- | ------ |
| dense-only                 | 0.80     | 0.84      | 0.586  |
| hybrid (dense + BM25, RRF) | 0.84     | 0.96      | 0.672  |

Recall@10 goes 0.84 to 0.96, and the miss lists say why more clearly than the
aggregate: dense-only misses four questions, hybrid misses one. Legal queries
turn on exact tokens — section numbers, "cognizable", "bail-bond", "proclaimed
offender" — and a cosine over 768 dimensions blurs precisely those, because it is
trained to. Dense finds text that is _about_ the thing; BM25 finds text that
contains the _word_.

The sparse leg is my own BM25 encoded into **Qdrant sparse vectors** rather than a
second search engine alongside:

1. One store means one filter language. `session_id`, `act_short` and
   `section_number` apply identically to both legs. With a separate engine,
   session scoping for uploads would be implemented twice and would eventually
   diverge — a confidentiality bug waiting to happen, not a performance detail.
2. A point's dense and sparse vectors are upserted together, so the two indexes
   never disagree about what exists.
3. One less service in a compose stack that already runs six.

Qdrant scores a sparse vector with a dot product, so BM25 is split across the two
sides: the **document side carries term saturation** (`k1=1.2`, `b=0.75`, length
normalised against the corpus average) and the **query side carries IDF**. Their
dot product is BM25. Term ids are an FNV-1a hash, so no vocabulary file has to
ship or stay in sync with the index.

The cost is real: corpus statistics live in `data/bm25-<collection>.json`, and
losing that file degrades the system to dense-only. So it does not happen
quietly — `hybridSearch` logs a warning and the eval regression test skips
outright rather than measure dense-only and label it hybrid. That mistake already
cost an afternoon once.

## 6. RRF, and why k went from 60 to 20

Cosine and BM25 scores are not on comparable scales, and normalising them against
each other is guesswork that changes with the query. Reciprocal rank fusion reads
only rank positions: `1/(k + rank)`, summed across legs.

`k` controls how flat that curve is. A large `k` compresses the gap between rank
1 and rank 30, so the sum-across-legs term dominates and being found by _both_
legs beats being found _well_ by one. That is wrong for this corpus, where the
most useful single signal is a strong lexical hit on a rare statutory phrase the
dense leg never surfaces at all.

At **k=60**, a passage only the dense leg found, at rank 5, scores `1/65 =
0.0154`; a weaker passage both legs found at rank 30 scores `2/90 = 0.0222` and
wins. At **k=20** that pair is a dead heat (`1/25` against `2/50`, both 0.0400)
and any better single-leg rank wins outright — a rank-4 dense hit scores `1/24 =
0.0417`. That is the exact mechanism by which s.58 kept falling out of the top
ten.

The fused score is a rank, useful for ordering and meaningless as a confidence,
so `hybridSearch` carries the raw cosine forward on every row as `dense_score`
for the refusal gate to threshold against (§8).

## 7. The reranker: cross-encoder, pool 6, full text

Both legs score query and passage independently and then compare vectors. A
cross-encoder reads them together, which is what separates the section that
_answers_ a question from the section that merely shares its vocabulary.
`BAAI/bge-reranker-base` runs on a second TEI container.

The configuration was tuned by measurement on an earlier 20-question set. Those
numbers are not comparable with the README table above — they are the record of
how the knobs were chosen:

| config                                        | hit@1   | hit@5   | MRR@10    | p50         |
| --------------------------------------------- | ------- | ------- | --------- | ----------- |
| before this pass (RRF k=60, no reranker)      | 60%     | 85%     | 0.708     | 28 ms       |
| reranker pool 12, text truncated to 700 chars | 55%     | 95%     | 0.718     | 1535 ms     |
| reranker pool 12, full text                   | 75%     | 95%     | 0.829     | 3071 ms     |
| **shipped: pool 6, full text, RRF k=20**      | **80%** | **95%** | **0.867** | **1586 ms** |
| pool 25, full text                            | 75%     | 95%     | 0.838     | 7187 ms     |

The finding that decided it: **truncating the passage is what destroys a
cross-encoder, not the pool size**. Pool 12 truncated to 700 characters scored
worse at hit@1 than no reranker at all (55% against 60%) while costing 1.5
seconds. Six full passages beat twelve short ones at half the time. So
`RERANK_MAX_CHARS` is 1800 — the same as the chunk cap, i.e. every candidate goes
in whole — and the pool is small on purpose, not on budget.

It reranks on **the user's question**, not the HyDE passage: HyDE moves a query
into passage space for a bi-encoder, and a cross-encoder does better without
synthetic wording in the way. But the question goes through the same synonym
bridge the sparse leg gets (§10), and getting that wrong cost real accuracy for a
while: `expandQuery` was applied only to BM25, so the retriever searched for the
statutory words while the cross-encoder re-read the user's colloquial ones and
undid the work. Measured straight against the reranker, "grounds for anticipatory
bail" scores the correct passage — s.482(1), "person apprehending arrest" — at
**0.0031**, losing to a near miss at 0.0068; through the bridge the same passage
scores **0.9805**. The phrase never appears in the BNSS, which is the point of the
bridge. Routing the reranker query through it moved s.482(1) from rank 5 to rank
1 and MRR@10 from 0.716 to 0.765. It is **skipped when the question names its
section**, because a direct lookup is already exact. And if it is slow or down
the fused order is returned and the request still succeeds — a quality component
must not become an availability dependency.

On the final golden set the reranker does not change what is found (Recall@10
stays 0.96), it changes the order (MRR@10 0.672 to 0.765). That is the honest
description of its job: find with BM25, order with the cross-encoder. It costs
about 1.5 s on CPU and 4–6 ms on the L4, which is what `docker-compose.gpu.yml`
exists for.

## 8. The refusal threshold: 0.58, on the cosine scale

Measured, not guessed. In-scope questions land at a top cosine of **0.62–0.80**,
out-of-scope at **0.37–0.53**. There is a clean gap, and 0.58 sits inside it,
nearer the bottom of the in-scope band, because a false refusal is a visible
annoyance and a confident wrong answer about criminal procedure is the failure
that matters.

The scale is the whole decision, and I got it wrong first. The threshold was
originally applied to the **RRF score**, whose magnitude depends on how many legs
found the document rather than on how similar anything is; in single-leg mode
every score fell below it and the system refused everything. Separately, a BM25
score was once used as the similarity: it is unbounded, so "what is the capital of
France" cleared the bar and got an answer. Same bug twice. `shouldRefuse` now
reads `dense_score` only, and a result the dense leg never returned counts as
zero similarity rather than inheriting a rank score. That is deliberately
conservative: a document found only by BM25 cannot by itself unlock an answer.

On the golden set this holds — 6/6 out-of-scope questions refused in all three
configurations, and zero in-scope refusals across the 25 answerable ones.

### Uploaded documents get their own band

0.58 was measured on statute retrieval, and applying it to a file the user
uploaded was wrong twice over: the number was fitted to a different corpus, and
the risk it guards against does not exist there. The gate is meant to stop the
bot answering law it does not hold. A document the user chose and pointed at is
in scope by their own decision, and a short file written in ordinary words simply
scores lower than gazette prose.

It showed up as a live bug: "where did he work in the past?" against an uploaded
page retrieved the right chunk at 0.52 and was refused for low confidence.
Measured on that page — answerable questions 0.44 to 0.61, unanswerable ones 0.29
to 0.30 or no document hit at all — so documents get `0.38`, in the gap, and the
statute keeps 0.58. Refusal is now per source: it takes both bands failing. An
off-topic question with a document in scope is still refused, which is the
behaviour that matters.

Four questions either side is a small sample and the number should be re-measured
against a real set of uploads.

## 9. Citations are enforced in code, not in the prompt

The prompt does ask for citations. That is not an enforcement mechanism. A prompt
instruction is a request to a probabilistic system, and the auto-reject criterion
in the brief is a property the output must actually have. So the model is asked,
and then the code checks.

Validation is **two-stage on purpose**. A single strict regex was the original
implementation and it failed the exact case that matters: `[BNSS s.103 and
s.999]` did not match the strict pattern, so it was left alone, so it passed as
valid. The fix inverts the default — a loose pattern catches anything
bracket-shaped carrying a digit and an act hint, and whatever it catches must
then parse under the strict pattern. **Unparseable now means invented**, and is
stripped. Whatever parses is checked against the retrieved context, act included,
because BNS and BNSS are different acts and confusing them is the most likely
model error here.

Three refinements the eval and review found:

- **Streaming and stripping pull against each other.** An invented citation must
  never be visible, not even for the moment before a post-hoc pass removes it.
  `createMarkerGate` buffers from an unmatched `[` until the `]` arrives, judges
  that one marker, then emits or drops it. Nothing else is delayed.
- **The context prints a page beside every passage and the model copies it**, so
  `[BNSS s.63, p.191]` was thrown away whole and two answers came out with no
  citations at all. A trailing page is now tolerated and dropped; the section
  still has to be one that was retrieved.
- **A cross-reference is not a hallucination.** Section 187 points at section 58
  in its own text, so an answer repeating that in prose was flagged as inventing
  s.58. A bracketed marker still has to be something we retrieved; prose quoting
  the source is quoting the source.

Subsection binding gets the same treatment: a citation binds to the chunk that
actually holds that subsection or clause, and where no retrieved chunk holds it,
the marker is rewritten to cite the section _without_ claiming the subsection.
Falling back to the first chunk of the section instead put a passage in the
source drawer that the citation was not in — a quieter and worse failure than a
missing subsection. It is not fully fixed; see §17.

## 10. The synonym bridge, and its overfitting risk

`retrieval/synonyms.js` maps the words people use onto the words the draftsman
used. "Anticipatory bail" appears nowhere in the BNSS; the act says "apprehending
arrest". Nobody types "report of a police officer on completion of investigation"
when they mean chargesheet.

Two constraints keep it honest. Each entry **adds** statutory phrasing and never
replaces what the user typed, so an entry can only extend the candidate set. And
it applies to **the sparse leg only** — the dense embedding already handles
paraphrase, and stuffing statutory boilerplate into the dense query would fight
the HyDE passage already there. The commit that added it recorded Recall@10 on
the hard set going 0.80 to 0.96.

The caveat, also in the README: **four entries were added after seeing which
golden-set questions missed.** That is overfitting to the measurement. My defence
is weak but not nothing — those four are general vocabulary a real user would
type ("jumped bail", "how long … custody"), not question-specific patches, and
none names a section. The correct answer is still to validate the bridge against
a set it was not built against, which I have not done.

## 11. HyDE on the dense leg only

The triage call writes a two-to-four sentence passage in the voice of a bare act,
and that text is what gets embedded for the dense leg. It moves a colloquial
question into the space the corpus occupies.

It is deliberately not given to the sparse leg. BM25 matches words, and a
generated passage floods the query with plausible statutory vocabulary the user
never typed, diluting the IDF weight of the terms that identify what they want.
The sparse leg gets the raw question plus the standalone rewrite when there is
history.

HyDE is **skipped for section lookups**. If the question says "section 103" the
answer is a payload filter, not a semantic search, and writing a passage about
section 103 in order to go looking for section 103 is a wasted model call.
`detectSectionIntent` is a regex and costs nothing. Triage and HyDE are one call
rather than two, and a failure in either falls back to a concept question with no
HyDE.

## 12. Guardrails: cheap layer first, model second

The layers have different costs and different failure modes, so they are ordered
by both.

The **pattern layer** is regex, runs first, costs nothing and never touches the
network; it normalises zero-width characters and whitespace first, those being
the cheapest ways past a regex. Rules are soft or hard. A soft rule firing in a
sentence that carries ordinary legal vocabulary — court, magistrate, evidence,
warrant, a section number — is _not_ treated as an attack, because "can the court
disregard the rules of evidence" is a real question about a real provision. That
softening unblocked ten legitimate legal questions the layer had been refusing.
Hard rules ("developer mode", "act as unrestricted", "do not cite your sources")
never soften.

The **classifier** is a small-model call, and only what survives the patterns
reaches it. If it errors or times out the request is **allowed** — a broken
classifier must not take the product down. That asymmetry is deliberate: the
layer permitted to fail open is the one that costs money and can be unavailable;
the layer that cannot fail open is the one that always runs.

Two carve-outs:

- **Uploads are exempt from the out-of-scope check.** With a document in play, an
  `out_of_scope` verdict is overridden. "Where did he work" is not a criminal law
  question and is exactly what the upload feature is for; without this the
  feature is dead on arrival, which is what the screenshots caught.
- **Document text gets no softening at all.** `findDocumentInjection` runs the
  same rules with soft-suppression disabled, plus rules for the polite-instruction
  shapes a planted PDF uses ("Important note for the AI assistant…"). A user may
  word a question awkwardly; an uploaded file has no business giving orders.

## 13. Two corpora, one session, and untrusted text

Uploads go into a **separate Qdrant collection** with `session_id` on every
point, and the document leg's filter always carries that session id — built in
one function, so it cannot be forgotten at a call site. Documents cite as
`[doc: name.pdf p.2]`, a shape distinct from `[BNSS s.63]`, so a user's own
evidence can never be presented as statutory authority.

Injection from an uploaded file is handled by **removal, not instruction**.
Before retrieved document text reaches the prompt it is split into sentences and
any sentence reading as an instruction is dropped, so the model never sees the
order rather than being asked nicely to ignore it. The cost: a legitimate
sentence that happens to read like a directive is silently deleted and the user
is not told — only the log records how many went. I would rather lose a sentence
than take an order from a PDF, but it is a cost.

## 14. Smaller calls worth naming

- **Diversity cap of 2 chunks per section**, or three fragments of s.187 take the
  whole context window. Overflow is appended, not discarded.
- **Second Schedule forms are retrievable chunks, not just files.** "Summons to
  an accused person" is Form No. 2, and used to return s.2, Definitions.
- **Degrade, do not fail.** Reranker down: fused order. Classifier down: allow.
  BM25 stats missing: dense-only with a warning. Corrupt SSE frame: keep the
  answer already half generated.
- **The CI gate is a floor under the measured number, not the number itself** —
  Recall@10 ≥ 0.88 against a measured 0.96, MRR ≥ 0.60 against 0.765 — so it
  fails when retrieval gets worse, not when a hard question stays hard. Coverage
  was fixed the same way round: a synthetic fixture PDF so corpus tests stop
  self-skipping (CI 35% against a 60% floor, now 63%), rather than lowering the
  gate.

## 15. Configuration, in one place

| knob                    | value      | why                                                        |
| ----------------------- | ---------- | ---------------------------------------------------------- |
| chunk max chars         | 1800       | bge-base truncates at 512 tokens, minus the heading prefix |
| statute overlap         | 0          | structure supplies the seams (§3)                          |
| upload chunk / overlap  | 1500 / 150 | no structure to rely on                                    |
| candidate pool per leg  | 40         | enough for RRF to have something to fuse                   |
| RRF k                   | 20         | 60 was too flat (§6)                                       |
| rerank pool / max chars | 6 / 1800   | full passages beat more passages (§7)                      |
| top k into the prompt   | 8          | with the per-section cap of 2, at least 4 sections         |
| confidence threshold    | 0.58       | measured gap, 0.62–0.80 against 0.37–0.53 (§8)             |

## 16. What I would do differently with two more weeks

1. **Validate the synonym bridge against a held-out set.** Four entries were
   written after seeing misses. Splitting the golden set, or writing a second set
   blind and only then running the bridge against it, is the only way to know
   whether it generalises or is a lookup table for my own eval.
2. **Fix s.58 properly rather than tune around it.** The right fix is a
   per-chapter diversity cap or query expansion — s.187 owns the custody language
   and crowds out the section carrying the twenty-four hour rule. A synonym entry
   aimed at that one question would raise the score and teach me nothing, which
   is why the miss is still in the README.
3. **A bigger, genuinely adversarial golden set.** 25 answerable questions is too
   few for the differences I report to be significant — the citation accuracy gap
   in §17 is the proof. I want near-miss pairs (s.35 against s.170, both
   warrantless arrest), answers spanning two sections, and questions phrased in
   words the act never uses.
4. **Measure recall at chunk level.** `run_eval.js` keys on `act + section`, so
   retrieving the wrong subsection of the right section scores as a hit. For a
   system that cites down to `s.35(1)(a)`, that is the wrong resolution.
5. **Bind citations per subsection properly**, so a chunk holding several clauses
   cannot be shown as evidence for a subsection it starts in the middle of (§17).
   That wants clause offsets recorded at chunk time, not more regex at validation
   time. And **give the worker its own healthcheck** so `docker compose ps` stops
   lying about it (§17).
6. **An answer-faithfulness check.** Citation accuracy proves the section was
   retrieved and expected; it does not prove the sentence follows from the
   passage. An LLM judge over a sample is the missing half of Part F.
7. **Benchmark the embedding model.** bge-base at 768 dimensions was chosen on
   reasoning and never compared with anything. The harness can answer this in one
   run, which is why it is embarrassing that it has not.
8. **Ingest First Schedule Part II** (offences under other laws, page 189),
   which has its own column layout and was left out of the parser, and **cut the
   pre-retrieval model calls** — a first turn costs an input classifier call plus
   a triage/HyDE call, and a follow-up adds a standalone rewrite, roughly two
   seconds before retrieval even starts.

## 17. What I know is broken

**s.58 is a documented miss.** "A man is picked up by the police at 10pm on
Monday. By when does he have to be in front of a magistrate?" The shipped
configuration returns s.57 and s.78 — both genuinely about producing an arrested
person before a magistrate — and not s.58, which carries the twenty-four hour
limit. It is the single miss behind Recall@10 of 0.96, and it misses in all three
configurations. Three adjacent sections, and the precise one loses. Left as it
is, because a bridge entry aimed at it would overfit a 25 question set.

**Citation accuracy got _worse_ under reranking: 0.76 against 0.84 for the other
two configurations.** On 25 answered questions that is two answers. Each
configuration's answer pass is a separate set of model calls, and the same
configuration measured 0.917 and 0.958 on two runs of an earlier golden set, so
my reading is run-to-run variance rather than a real effect. But that is a
reading, not a measurement, and the honest position is that this set is too small
to tell the difference. The reranker ships on the retrieval evidence (MRR@10
0.765, best of the three) and the answer-side number is reported as measured
rather than quietly dropped.

**The synonym bridge is fitted to its own test.** Four entries were added after
seeing the misses (§10), so the reported Recall@10 of 0.96 is partly a
measurement of my eval-reading rather than of the retriever.

**`[BNSS s.35(1)]` can bind to a passage that starts mid clause-list.** Section 35
chunks into four pieces; three carry `subsection: "(1)"` because the clause list
is too long for one chunk, and two of those begin at `(c)` and at `(j)`. The
validator matches the subsection label exactly, so if it binds to one of those,
the source drawer shows a passage that does not contain the opening words of
s.35(1). The prose citation is right and the evidence panel misattributes. The
earlier, worse version of this — where any subsection fell through to the first
chunk of the section, so `s.35(1)(a)` and `s.35(1)(j)` rendered the same passage
— is fixed. This narrower one is not.

**The worker container reports `unhealthy`.** It runs the API image with a
different command, and that image's `HEALTHCHECK` fetches
`http://127.0.0.1:8000/api/v1/health`. The worker serves no HTTP, so the probe
fails forever. The worker itself works — uploads parse, chunk, embed and become
queryable — but `docker compose ps` said otherwise, and a healthcheck that lies
is worse than no healthcheck. The inherited probe is now disabled on that service,
which stops the lie but does not replace it: the worker still has no liveness
signal of its own, and what it wants is a probe against the BullMQ connection
rather than against a port it does not listen on.

**Two smaller ones.** First Schedule Part II (page 189) is not ingested, so an
offence under another act cannot be classified. And the golden set can only tell
you so much: 25 answerable questions and 6 refusals, at which size one question
moves Recall@5 by four points. The measurement is now the weak link in this
system, not the retriever.
