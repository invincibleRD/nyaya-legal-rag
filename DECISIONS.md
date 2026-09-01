# Decisions

`ARCHITECTURE.md` says what the system is. This says why, and what each choice
cost. Every number here was measured on the deployed stack — a GCP VM with an
NVIDIA L4 — not on a laptop. Where a measurement is thin I say so.

---

## 1. The supplied corpus is not the BNS

The PDF handed out with the brief is the **Bharatiya Nagarik Suraksha Sanhita
(BNSS), 2023 — Act 46 of 2023**, the criminal _procedure_ code. Not the
Bharatiya Nyaya Sanhita. 249 pages, sha256 `5e60e2af…`:

| Pages   | Content                                      |
| ------- | -------------------------------------------- |
| 1–157   | Sections 1–531, the operative act            |
| 158–189 | First Schedule, offence classification table |
| 190–249 | Second Schedule, 58 statutory forms          |

The brief's own forms range, 190–249, matches this file exactly, so its page
numbers were built against this same PDF and only the act _name_ is wrong. I
treated the file as authoritative and the name as a typo.

This changes what the system can honestly do. Substantive offences and their
punishments live in the BNS, so the brief's sample question — the punishment for
culpable homicide — is **unanswerable from the supplied file**, and a system that
answers it is hallucinating. Three consequences:

- **Refusal is a feature, not a fallback.** Six golden-set questions must be
  refused; all three configurations refuse all six.
- **The First Schedule is the one place the BNS legitimately appears.** Its rows
  are BNS sections printed inside a BNSS gazette, so they carry `act_short: 'BNS'`
  and cite as `[BNS s.351]`. That is what makes "is section 351 bailable"
  answerable without pretending this act holds the offence.
- **"Section 63" is ambiguous** across the two acts. `detectSectionIntent` reads
  the act from the question; a bare number defaults to BNSS.

## 2. Chunking: the section is the atomic unit

A statute is already chunked, by its draftsman. Discarding that for a fixed
character window is the one thing the brief rules out, and it would be wrong
anyway: it severs a proviso from the rule it qualifies, so the retrieved passage
states an obligation without its exception.

So a section is one chunk when it fits, and when it does not the split ladder is
**subsection → clause → sentence**, never below. Provisos, explanations and
illustrations stay attached to their parent. The cap is 1800 characters, set by
bge's 512-token window, not chosen for taste.

Section titles come from the **marginal notes**, which sit in a narrower column
than body text. The parser reads pdfjs coordinates — x, y and glyph height — to
tell a marginal note from a running header from body prose. Section numbers are
gated sequentially so a cross-reference in the middle of a sentence cannot be
mistaken for the start of a new section.

**Overlap: none in the statute.** Every seam is already a structural boundary,
and each chunk's `embed_text` carries its chapter and section title, so the
context a sliding window would duplicate is present by construction. Uploaded
documents get 1500/150 instead, because an arbitrary PDF has no structure to cut
on.

## 3. Embeddings: bge-base, self-hosted

`BAAI/bge-base-en-v1.5` on a Text Embeddings Inference container. Open weights,
no hosted embedding API — required by the brief, and right regardless: uploaded
documents are the user's case papers and should not leave the box.

Base rather than large because the whole thing has to run on a reviewer's CPU
from a clean clone. One TEI image serves both the embedder and the cross-encoder,
so the marginal cost of adding reranking was one container, not a new dependency.

bge is asymmetric — queries take an instruction prefix, passages go in raw. That
lives in exactly one function, because applying it to passages at index time and
not at query time is a silent quality bug with no error attached.

## 4. Hybrid retrieval, and BM25 inside Qdrant

Dense alone loses on statute questions. Recall@10 goes **0.84 → 0.96** the moment
BM25 joins, because these questions turn on exact identifiers ("section 187",
"Form 2") and colloquial terms that a cosine over 768 dimensions blurs.

BM25 is implemented into Qdrant's own sparse vectors rather than bolting on a
second search engine: saturation on the document side at index time, IDF on the
query side at search time. One store, one query, no consistency problem between
two indexes. The cost is a statistics file on disk — and if it is missing the
sparse leg cannot run, so the retriever logs a warning rather than quietly
degrading to dense-only. It used to degrade silently, and a test "passed" while
measuring the wrong thing.

**RRF k went 60 → 20.** At k=60 the curve is nearly flat: a passage only one leg
found at rank 1 scores 1/61, while a mediocre one both legs found at rank 30
scores 2/90 — and the mediocre one wins. k=20 sharpens that back up. Measured:
MRR 0.669 → 0.672 on its own, but it is what lets the reranker see the right
candidates at all.

## 5. Reranking: pool 12, full text

A cross-encoder reads query and passage together, which is what separates the
section that _answers_ a question from the one that merely shares its vocabulary.
`BAAI/bge-reranker-base`, same TEI image.

The knobs were chosen by sweep (`eval/sweep.js`), run on the deployed L4. Two
runs gave byte-identical quality figures — retrieval here is deterministic:

| config                          | hit@1    | R@5      | R@10 | MRR@10    | p50   |
| ------------------------------- | -------- | -------- | ---- | --------- | ----- |
| no reranker, RRF k=60           | 0.52     | 0.84     | 0.96 | 0.669     | 14 ms |
| no reranker, RRF k=20           | 0.52     | 0.84     | 0.96 | 0.672     | 13 ms |
| pool 6, truncated 700           | 0.72     | 0.84     | 0.96 | 0.775     | 21 ms |
| pool 12, truncated 700          | 0.76     | **0.92** | 0.96 | 0.811     | 24 ms |
| pool 6, full text               | 0.72     | 0.84     | 0.96 | 0.765     | 23 ms |
| **shipped: pool 12, full text** | **0.80** | 0.88     | 0.96 | **0.831** | 28 ms |
| pool 25, full text              | 0.68     | 0.84     | 0.96 | 0.757     | 42 ms |
| pool 40, full text              | 0.64     | 0.84     | 0.92 | 0.732     | 62 ms |

**Bigger is not better.** 25 and 40 are both worse than 12: more candidates give
the cross-encoder more chances to prefer something plausible over something
correct. The curve peaks and turns over.

**A correction worth recording.** An earlier sweep on a laptop CPU concluded that
_truncation_ was what destroyed cross-encoder quality, and pool 6 was shipped
because 12 candidates cost three seconds there. On the GPU both halves of that
turn out to be wrong: pool 12 _truncated_ (0.811) beats pool 6 _full_ (0.765), so
pool size dominates and truncation costs comparatively little — and the latency
that forced the small pool is 5 ms, not 3 s. The lesson is narrower than "measure
things": measure on the hardware you deploy on, because a constraint that shapes
the whole configuration can simply not exist there.

**The reranker needs the synonym bridge too.** `expandQuery` originally ran on
the sparse leg only, so BM25 searched for statutory words while the cross-encoder
re-read the user's colloquial ones and undid the work. Measured straight against
the reranker, "grounds for anticipatory bail" scores the correct passage —
s.482(1), "person apprehending arrest" — at **0.0031**, losing to a near miss at
0.0068; through the bridge, **0.9805**. The phrase never appears in the BNSS,
which is the point of the bridge. That one line moved s.482(1) from rank 5 to
rank 1.

It reranks the user's question, not the HyDE passage — HyDE moves a query into
passage space for a bi-encoder, and a cross-encoder does better without synthetic
wording in the way. It is skipped when the question names its section, since a
direct lookup is already exact. If it is slow or down, the fused order is
returned and the request still succeeds: a quality component must not become an
availability dependency.

## 6. Refusal thresholds, measured not guessed

**Statute: 0.58 cosine.** In-scope questions land 0.62–0.80, out-of-scope
0.37–0.53, so the gap is wide and the threshold sits in it. Two bugs had to be
fixed to get an honest number: the threshold was once applied on the RRF scale,
which ranks rather than measures, and once on a BM25 score, which is unbounded —
so "the capital of France" got answered.

**Uploads: 0.38.** Applying 0.58 to a file the user uploaded was wrong twice
over. The number was fitted to a different corpus, and the risk it guards against
does not exist there: the gate is meant to stop the bot answering law it does not
hold, and a document the user chose is in scope by their own decision. It showed
up as a live bug — "where did he work in the past?" retrieved the right chunk at
0.52 and was refused. Measured on that page: answerable 0.44–0.61, unanswerable
0.29–0.30 or no document hit at all. Refusal is now per source, and it takes both
bands failing. **Four questions either side is a thin sample** and this number
should be re-measured against a real set of uploads.

## 7. Citations are enforced in code, not in the prompt

A prompt instruction is a request. The contract is enforced after generation:
every `[BNSS s.N]` marker in the answer must correspond to a passage actually
retrieved, or it is stripped — from the markers _and_ from the prose, since a
model that invents a section will also name it in a sentence. A streaming marker
gate holds back partial markers so a half-written citation never reaches the
browser.

Binding a marker to a passage is two-stage: match the subsection label exactly,
else find a chunk whose text demonstrably holds that clause, else fall back to
the section and **drop the subsection rather than mis-bind it**. The earlier
version fell through to the first chunk of the section, so `s.35(1)(a)` and
`s.35(1)(j)` rendered the same passage.

The guard also once destroyed _correct_ citations: its regex did not tolerate the
page suffix the prompt asks for, so `[BNSS s.63, p.191]` was deleted and answers
came out uncited. Review missed that twice; the eval caught it, and citation
accuracy went 0.875 → 0.958.

## 8. Guardrails: cheap layer first

16 regex rules run first — no network, no cost — and catch the obvious. Only a
soft hit that also contains legal vocabulary escalates to a small classifier, so
the common case is free and a legitimate question phrased awkwardly is not thrown
away. Ten real legal questions were being blocked as injection before this split
("can the court disregard the rules of evidence").

An uploaded document exempts a question from the out-of-scope check, because
"where did he work" is a legitimate question about the user's own file whatever
the subject.

**Document text gets no softening.** Uploaded content is split into sentences and
any sentence reading as an instruction is dropped before it reaches the prompt —
removal, not a polite request to ignore it. The cost: a legitimate sentence that
happens to read like a directive is silently deleted and only the log records it.
I would rather lose a sentence than take an order from a PDF.

## 9. No auth, so the IP is the security boundary

The app is public with a paid API key behind it. Sessions are anonymous and
client-declared by design — which means the session id **cannot** be a rate-limit
key. Rotating one header bought unlimited quota, so every limit was decorative.

The real budget keys on the client IP, which requires `trust proxy` set to a
hop count and never `true` — `true` lets any client forge `X-Forwarded-For` and
mint itself a fresh bucket. The production chain is GCLB → nginx → app and the
client IP is 3 hops in, determined by reading what the container actually
received rather than by guessing.

Rate per minute is not enough on its own: a per-minute counter cannot see fifty
SSE streams held open at once, and those are the expensive ones. So there is also
a concurrency cap on in-flight generations, a rolling daily spend ceiling, and
per-session caps on conversations and documents so Redis cannot be filled.

## 10. Degrade, do not fail

Reranker down: fused order. Classifier down: allow. BM25 statistics missing:
dense-only, with a warning. Corrupt SSE frame: keep the answer already half
generated. Redis unreachable: limits fall back to an in-process counter rather
than disappearing.

One caveat this cuts both ways. Silent fallback is right in production and
dangerous in measurement: the sweep's pool-40 row initially returned figures
identical to _no reranker_ because TEI's client batch size defaults to 32 and
rejected the payload, and the caller fell back exactly as designed. The fallback
was correct; the measurement was worthless. Raising that limit is why pool 40 has
real numbers in the table above.

## 11. What I would do with two more weeks

- **Validate the synonym bridge against a held-out set.** Four of its entries
  were written after seeing which questions missed, so the reported Recall@10 is
  partly a measurement of my eval-reading.
- **A golden set several times larger.** At 25 answerable questions, one question
  moves Recall@5 by four points. The measurement is now the weakest link in this
  system, not the retriever.
- **Re-measure the upload threshold** against real documents rather than one
  synthetic page.
- **Split s.35 differently** so a subsection citation cannot bind to a chunk that
  starts mid-clause-list.
- **A real worker liveness probe** against the BullMQ connection.
- **Ingest First Schedule Part II**, the general classification rules.

## 12. What I know is broken

**s.58 is a documented miss.** "A man is picked up at 10pm on Monday, by when
must he be before a magistrate?" returns s.57 and s.78 — both genuinely about
producing an arrested person — and not s.58, which carries the twenty-four hour
limit. It is the single miss behind Recall@10 of 0.96, and it misses in all three
configurations. Left alone, because a bridge entry aimed at it would overfit a 25
question set.

**`[BNSS s.35(1)]` can bind to a passage that starts mid clause-list.** Section 35
chunks into four pieces; three carry `subsection: "(1)"` because the clause list
is too long for one chunk, and two of those begin at `(c)` and at `(j)`. The
prose citation is right and the evidence panel misattributes.

**The synonym bridge is fitted to its own test**, as above.

**The upload threshold rests on eight questions**, four either side.

**`docs/api-contract.md` has drifted** from the code — it documents
`dense_rank`/`sparse_rank` on search results, which the API does not return.
`/docs` is generated against the code and is correct; the markdown is stale.

**The worker has no liveness signal.** It ran the API image and inherited an HTTP
probe it could never pass, so it always reported `unhealthy`. The inherited probe
is now disabled, which stops the lie but does not replace it.
