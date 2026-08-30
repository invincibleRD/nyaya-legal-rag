// keep digits, statute queries are full of them ("section 103", "s.63")
const WORD = /[a-z0-9]+/g

// last row is question words, noise on the query side and useless on the document side
const STOPWORDS = new Set(
  `a an and any are as at be been by for from has have he her his in is it its may not of on or
   shall she such that the their them then there this to was were which who with you
   what when where why how can do does did will would`.split(/\s+/)
)

export function tokenize(text) {
  const out = []
  for (const m of text.toLowerCase().matchAll(WORD)) {
    const t = m[0]
    if (t.length < 2 && !/\d/.test(t)) continue
    if (STOPWORDS.has(t)) continue
    out.push(t)
  }
  return out
}
