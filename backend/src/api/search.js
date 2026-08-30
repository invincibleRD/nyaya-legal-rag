import { Router } from 'express'
import { z } from 'zod'
import { retrieve } from '../retrieval/hybrid.js'

export const search = Router()

const body = z.object({
  query: z.string().min(1).max(2000),
  top_k: z.number().int().min(1).max(50).optional(),
  mode: z.enum(['hybrid', 'dense', 'sparse']).optional(),
  document_ids: z.array(z.string()).optional(),
  filters: z
    .object({
      act_short: z.string().optional(),
      chapter: z.string().optional(),
      section_number: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
})

search.post('/search', async (req, res, next) => {
  const parsed = body.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    })
  }

  try {
    const { query, top_k: topK, mode, filters, document_ids: documentIds } = parsed.data
    const result = await retrieve({
      query,
      topK,
      mode,
      filters: filters || {},
      documentIds: documentIds || [],
      sessionId: req.sessionId,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
})
