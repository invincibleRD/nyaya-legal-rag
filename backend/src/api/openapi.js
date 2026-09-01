// hand written so the spec says what the code does, not what zod happens to infer
const error = {
  type: 'object',
  properties: {
    error: {
      type: 'string',
      enum: [
        'not_found',
        'validation_error',
        'payload_too_large',
        'unsupported_media_type',
        'rate_limited',
        'upstream_unavailable',
        'internal_error',
      ],
    },
    message: { type: 'string' },
  },
}

const citation = {
  type: 'object',
  properties: {
    marker: { type: 'string', example: '[BNSS s.103(1)]' },
    source: { type: 'string', enum: ['statute', 'document'] },
    act_short: { type: 'string', nullable: true },
    section_number: { type: 'string', nullable: true },
    subsection: { type: 'string', nullable: true },
    section_title: { type: 'string', nullable: true },
    chapter: { type: 'string', nullable: true },
    page_start: { type: 'integer', nullable: true },
    page_end: { type: 'integer', nullable: true },
    text: { type: 'string' },
    score: { type: 'number' },
    document_id: { type: 'string', nullable: true },
    document_name: { type: 'string', nullable: true },
  },
}

const conversation = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
}

const document = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    filename: { type: 'string' },
    status: {
      type: 'string',
      enum: ['queued', 'parsing', 'chunking', 'embedding', 'ready', 'failed'],
    },
    progress: { type: 'number' },
    pages: { type: 'integer', nullable: true },
    chunks: { type: 'integer', nullable: true },
    bytes: { type: 'integer' },
    created_at: { type: 'string' },
  },
}

const form = {
  type: 'object',
  properties: {
    form_number: { type: 'string' },
    title: { type: 'string' },
    see_section: { type: 'string', nullable: true },
    page_start: { type: 'integer' },
    page_end: { type: 'integer' },
    page_count: { type: 'integer' },
    filename: { type: 'string' },
    bytes: { type: 'integer' },
    needs_review: { type: 'boolean' },
  },
}

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
})

const jsonResponse = (description, schema) => ({
  description,
  content: { 'application/json': { schema } },
})

const notFound = errorResponse('no such record, or it belongs to another session')
const validationError = errorResponse('request body failed validation')
const formsUnavailable = errorResponse('forms have not been extracted yet')

const pathId = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
}

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Nyaya legal RAG API',
    version: '1.0.0',
    description:
      'Retrieval augmented question answering over the BNSS 2023, plus per-session document ' +
      'upload, statute form downloads and raw retrieval for eval. Every response carries an ' +
      '`x-request-id` header.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'chat', description: 'streaming answers and conversation history' },
    { name: 'search', description: 'raw retrieval, for debugging and eval' },
    { name: 'documents', description: 'per-session pdf upload and ingestion status' },
    { name: 'forms', description: 'BNSS forms extracted from the source pdf' },
    { name: 'feedback', description: 'thumbs up/down on an answer' },
    { name: 'ops', description: 'health and metrics' },
  ],
  // the header is optional: the server mints a session id when it is absent or malformed,
  // and returns it on x-session-id so the client can keep using it
  security: [{ sessionId: [] }],
  components: {
    securitySchemes: {
      sessionId: {
        type: 'apiKey',
        in: 'header',
        name: 'x-session-id',
        description:
          'Anonymous session identity, 8-64 word characters. The client generates it on first ' +
          'load and sends it on every call. Omit it and the server generates a fresh one, which ' +
          'means no access to anything uploaded earlier.',
      },
    },
    schemas: {
      Error: error,
      Citation: citation,
      Conversation: conversation,
      Document: document,
      Form: form,
    },
  },
  paths: {
    '/chat': {
      post: {
        tags: ['chat'],
        summary: 'Ask a question, answered as a server-sent event stream',
        description:
          'Responds `text/event-stream`. Frames arrive as `event: <name>` plus a JSON `data` ' +
          'line, in this order:\n\n' +
          '- `meta` — `{ type, conversation_id, route, intent? }`, once, first. `route` is ' +
          '`statute`, `document`, `both`, `smalltalk` or `refused`.\n' +
          '- `token` — `{ type, text }`, zero or more, the answer streamed in fragments.\n' +
          '- `citations` — `{ type, citations: [Citation] }`, once, only on a retrieved answer ' +
          '(smalltalk and refusals skip it).\n' +
          '- `done` — `{ type, refused, answer?, reason?, usage: { input_tokens, output_tokens }, ' +
          'latency: { retrieval_ms, generation_ms, total_ms }, cost_usd }`, always last.\n' +
          '- `error` — `{ type, error, message }` instead of `done` if generation throws ' +
          'mid-stream; the HTTP status is still 200 because headers are already sent.\n\n' +
          'With no `document_ids` every document this session has finished ingesting is ' +
          'searchable. Closing the connection aborts generation.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', minLength: 1, maxLength: 4000 },
                  conversation_id: { type: 'string', nullable: true },
                  document_ids: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'the event stream',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
          400: validationError,
          404: errorResponse('conversation_id names a conversation this session does not own'),
          429: errorResponse('chat rate limit exceeded'),
        },
      },
    },

    '/conversations': {
      get: {
        tags: ['chat'],
        summary: "List this session's conversations",
        responses: {
          200: jsonResponse('conversations', {
            type: 'object',
            properties: {
              conversations: {
                type: 'array',
                items: { $ref: '#/components/schemas/Conversation' },
              },
            },
          }),
        },
      },
    },

    '/conversations/{id}': {
      get: {
        tags: ['chat'],
        summary: 'Read one conversation with its messages',
        parameters: [pathId],
        responses: {
          200: jsonResponse('the conversation', {
            allOf: [
              { $ref: '#/components/schemas/Conversation' },
              {
                type: 'object',
                properties: {
                  messages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string' },
                        citations: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Citation' },
                        },
                      },
                    },
                  },
                },
              },
            ],
          }),
          404: notFound,
        },
      },
      patch: {
        tags: ['chat'],
        summary: 'Rename a conversation',
        parameters: [pathId],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                // longer titles are accepted and truncated, not rejected
                properties: { title: { type: 'string', minLength: 1 } },
              },
            },
          },
        },
        responses: {
          200: jsonResponse('the renamed conversation', {
            $ref: '#/components/schemas/Conversation',
          }),
          400: errorResponse('title is missing or blank'),
          404: notFound,
        },
      },
      delete: {
        tags: ['chat'],
        summary: 'Delete a conversation',
        parameters: [pathId],
        responses: { 204: { description: 'deleted' }, 404: notFound },
      },
    },

    '/search': {
      post: {
        tags: ['search'],
        summary: 'Raw hybrid retrieval with no generation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string', minLength: 1, maxLength: 2000 },
                  top_k: { type: 'integer', minimum: 1, maximum: 50 },
                  mode: { type: 'string', enum: ['hybrid', 'dense', 'sparse'] },
                  document_ids: { type: 'array', items: { type: 'string' } },
                  filters: {
                    type: 'object',
                    properties: {
                      act_short: { type: 'string' },
                      chapter: { type: 'string' },
                      section_number: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: jsonResponse('ranked chunks', {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  allOf: [
                    { $ref: '#/components/schemas/Citation' },
                    {
                      type: 'object',
                      properties: {
                        fused_score: { type: 'number' },
                        dense_score: { type: 'number', nullable: true },
                        rerank_score: { type: 'number', nullable: true },
                        exact_match: { type: 'boolean' },
                      },
                    },
                  ],
                },
              },
              route: { type: 'string', enum: ['statute', 'both'] },
              intent: { type: 'object', nullable: true },
              top_score: { type: 'number' },
              took_ms: { type: 'integer' },
            },
          }),
          400: validationError,
        },
      },
    },

    '/documents/upload': {
      post: {
        tags: ['documents'],
        summary: 'Upload a pdf for ingestion',
        description:
          'Accepts a single pdf and queues it. The magic bytes are checked, so a mislabelled ' +
          'file is rejected even when its content-type says pdf. Poll ' +
          '`/documents/{id}/status` for progress.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          202: jsonResponse('queued', {
            type: 'object',
            properties: {
              document_id: { type: 'string' },
              job_id: { type: 'string' },
              filename: { type: 'string' },
              status: { type: 'string', enum: ['queued'] },
            },
          }),
          400: errorResponse('no file in the request, or multer rejected it'),
          413: errorResponse('file is over the upload size limit'),
          415: errorResponse('not a pdf, by declared type or by magic bytes'),
          429: errorResponse('upload rate limit exceeded'),
        },
      },
    },

    '/documents': {
      get: {
        tags: ['documents'],
        summary: "List this session's uploads",
        responses: {
          200: jsonResponse('documents', {
            type: 'object',
            properties: {
              documents: { type: 'array', items: { $ref: '#/components/schemas/Document' } },
            },
          }),
        },
      },
    },

    '/documents/{id}/status': {
      get: {
        tags: ['documents'],
        summary: 'Ingestion status of one upload',
        parameters: [pathId],
        responses: {
          200: jsonResponse('status', {
            type: 'object',
            properties: {
              document_id: { type: 'string' },
              status: {
                type: 'string',
                enum: ['queued', 'parsing', 'chunking', 'embedding', 'ready', 'failed'],
              },
              progress: { type: 'number' },
              pages: { type: 'integer', nullable: true },
              chunks: { type: 'integer', nullable: true },
              error: { type: 'string', nullable: true },
            },
          }),
          404: notFound,
        },
      },
    },

    '/documents/{id}': {
      delete: {
        tags: ['documents'],
        summary: 'Delete an upload and purge its vectors',
        parameters: [pathId],
        responses: { 204: { description: 'deleted' }, 404: notFound },
      },
    },

    '/forms': {
      get: {
        tags: ['forms'],
        summary: 'List every extracted BNSS form',
        security: [],
        responses: {
          200: jsonResponse('forms', {
            type: 'object',
            properties: {
              forms: { type: 'array', items: { $ref: '#/components/schemas/Form' } },
              count: { type: 'integer' },
            },
          }),
          503: formsUnavailable,
        },
      },
    },

    '/forms/search': {
      get: {
        tags: ['forms'],
        summary: 'Find forms by title or exact form number',
        security: [],
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: false,
            description: 'blank returns every form',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: jsonResponse('matching forms', {
            type: 'object',
            properties: {
              forms: { type: 'array', items: { $ref: '#/components/schemas/Form' } },
              count: { type: 'integer' },
              query: { type: 'string' },
            },
          }),
          503: formsUnavailable,
        },
      },
    },

    '/forms/download-all': {
      get: {
        tags: ['forms'],
        summary: 'Download every form plus the manifest as a zip',
        security: [],
        responses: {
          200: {
            description: 'zip archive',
            content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } },
          },
          503: formsUnavailable,
        },
      },
    },

    '/forms/{number}/download': {
      get: {
        tags: ['forms'],
        summary: 'Download one form as a pdf',
        security: [],
        parameters: [{ name: 'number', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'the form pdf',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
          404: errorResponse('no such form, or its file is missing on disk'),
          503: formsUnavailable,
        },
      },
    },

    '/feedback': {
      post: {
        tags: ['feedback'],
        summary: 'Rate an answer',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['conversation_id', 'rating'],
                properties: {
                  conversation_id: { type: 'string', minLength: 1 },
                  message_id: { type: 'string', nullable: true },
                  rating: { type: 'string', enum: ['up', 'down'] },
                  comment: { type: 'string', maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          201: jsonResponse('recorded', {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
          }),
          400: validationError,
        },
      },
    },

    '/health': {
      get: {
        tags: ['ops'],
        summary: 'Liveness',
        security: [],
        responses: {
          200: jsonResponse('alive', {
            type: 'object',
            properties: { status: { type: 'string' }, uptime: { type: 'number' } },
          }),
        },
      },
    },

    '/health/ready': {
      get: {
        tags: ['ops'],
        summary: 'Readiness, per dependency',
        security: [],
        responses: {
          200: jsonResponse('every dependency answered', {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              services: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    ok: { type: 'boolean' },
                    ms: { type: 'integer' },
                    error: { type: 'string' },
                  },
                },
              },
            },
          }),
          503: jsonResponse('at least one dependency is down; same body shape', {
            type: 'object',
            properties: { ready: { type: 'boolean' }, services: { type: 'object' } },
          }),
        },
      },
    },

    '/metrics': {
      get: {
        tags: ['ops'],
        summary: 'Prometheus exposition',
        security: [],
        responses: {
          200: {
            description: 'metrics',
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
        },
      },
    },
  },
}
