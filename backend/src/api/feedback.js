import { Router } from 'express'
import { z } from 'zod'
import { saveFeedback } from '../core/store.js'

export const feedback = Router()

const body = z.object({
  conversation_id: z.string().min(1),
  message_id: z.string().nullish(),
  rating: z.enum(['up', 'down']),
  comment: z.string().max(2000).optional(),
})

feedback.post('/feedback', async (req, res) => {
  const parsed = body.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation_error',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    })
  }
  await saveFeedback({ ...parsed.data, session_id: req.sessionId })
  res.status(201).json({ ok: true })
})
