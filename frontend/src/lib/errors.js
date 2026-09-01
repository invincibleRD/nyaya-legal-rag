const MESSAGES = {
  payload_too_large: 'That file is over the size limit. Try a smaller PDF.',
  unsupported_media_type: 'Only PDF files can be uploaded.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  upstream_unavailable: 'The model did not respond in time. Try again.',
  not_found: 'That item no longer exists.',
  validation_error: 'The request was rejected as invalid.',
  internal_error: 'Something broke on the server.',
}

export function friendly(code, fallback) {
  return MESSAGES[code] || fallback || 'Something went wrong.'
}
