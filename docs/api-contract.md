# API contract

Base path `/api/v1`. Session identity travels in the `x-session-id` header; the
client generates a uuid on first load and keeps it in localStorage. Every response
carries `x-request-id`.

## Chat

`POST /chat` -> `text/event-stream`

```json
{ "conversation_id": "uuid|null", "message": "what is section 103 BNSS?", "document_ids": [] }
```

Events:

| event | data |
| --- | --- |
| `meta` | `{ "conversation_id": "uuid", "route": "statute\|document\|both" }` |
| `token` | `{ "text": "partial text" }` |
| `citations` | `{ "citations": [Citation] }` |
| `done` | `{ "refused": false, "usage": {...}, "latency": { "retrieval_ms": 0, "generation_ms": 0 }, "cost_usd": 0 }` |
| `error` | `{ "error": "code", "message": "..." }` |

Citation:

```json
{
  "marker": "[BNSS s.103(1)]",
  "source": "statute",
  "act_short": "BNSS",
  "section_number": "103",
  "subsection": "(1)",
  "section_title": "Persons in charge of closed place to allow search",
  "chapter": "VII",
  "page_start": 30,
  "page_end": 30,
  "text": "verbatim chunk text",
  "score": 0.82,
  "document_id": null,
  "document_name": null
}
```

`source` is `statute` or `document`. Document citations carry `document_name` and
page numbers from the uploaded file, never an act or section.

## Conversations

- `GET /conversations` -> `{ "conversations": [{ "id", "title", "created_at", "updated_at" }] }`
- `GET /conversations/{id}` -> `{ "id", "title", "messages": [{ "role", "content", "citations" }] }`
- `PATCH /conversations/{id}` `{ "title": "new" }`
- `DELETE /conversations/{id}`

## Documents

- `POST /documents/upload` multipart `file` -> `{ "document_id", "job_id", "filename", "status": "queued" }`
- `GET /documents/{id}/status` -> `{ "document_id", "status": "queued|parsing|chunking|embedding|ready|failed", "progress": 0..1, "pages", "chunks", "error" }`
- `GET /documents` -> `{ "documents": [...] }` for this session only
- `DELETE /documents/{id}` -> `204`, purges vectors too

Ownership is enforced: another session's id returns `404`, never `403`.

## Search

`POST /search` -> raw retrieval, for debugging and eval

```json
{ "query": "...", "top_k": 8, "filters": { "act_short": "BNSS", "chapter": "V", "section_number": "103" }, "mode": "hybrid|dense|sparse", "document_ids": [] }
```

Returns `{ "results": [Citation & { "dense_rank", "sparse_rank", "fused_score" }], "route", "took_ms" }`.

## Forms

- `GET /forms` -> `{ "forms": [{ "form_number", "title", "see_section", "page_start", "page_end", "page_count", "filename", "bytes", "needs_review" }] }`
- `GET /forms/search?q=bail` -> same shape, title match
- `GET /forms/{form_number}/download` -> `application/pdf`
- `GET /forms/download-all` -> `application/zip`

## Feedback

`POST /feedback` `{ "conversation_id", "message_id", "rating": "up|down", "comment": "" }` -> `201`

## Ops

- `GET /health` liveness
- `GET /health/ready` `{ "ready", "services": { "qdrant": {...}, "embeddings": {...} } }`
- `GET /metrics` prometheus text
- `GET /docs` openapi ui

## Errors

`{ "error": "code", "message": "human readable" }` with codes `not_found`,
`validation_error`, `payload_too_large`, `unsupported_media_type`,
`rate_limited`, `upstream_unavailable`, `internal_error`.
