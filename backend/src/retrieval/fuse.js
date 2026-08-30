import { config } from '../core/config.js'

// reciprocal rank fusion. rank position matters, raw scores from a cosine
// search and a bm25 search are not comparable.
export function rrf(lists, { k = config.retrieval.rrfK, key = (x) => x.id } = {}) {
  const scores = new Map()
  const items = new Map()

  lists.forEach((list, listIndex) => {
    list.forEach((item, rank) => {
      const id = key(item)
      scores.set(id, (scores.get(id) || 0) + 1 / (k + rank + 1))
      if (!items.has(id)) items.set(id, { item, ranks: {} })
      items.get(id).ranks[listIndex] = rank + 1
    })
  })

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ ...items.get(id), id, score }))
}
