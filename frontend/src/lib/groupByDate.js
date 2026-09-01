const DAY = 86400000

// ChatGPT-style buckets. Conversations arrive newest first, so the order out
// matches the order in.
export function groupByDate(conversations) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const today = start.getTime()

  const buckets = new Map()
  for (const c of conversations) {
    const at = Date.parse(c.updated_at || c.created_at) || 0
    let label = 'Older'
    if (at >= today) label = 'Today'
    else if (at >= today - DAY) label = 'Yesterday'
    else if (at >= today - 7 * DAY) label = 'Previous 7 days'
    else if (at >= today - 30 * DAY) label = 'Previous 30 days'

    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label).push(c)
  }
  return [...buckets.entries()].map(([label, items]) => ({ label, items }))
}
