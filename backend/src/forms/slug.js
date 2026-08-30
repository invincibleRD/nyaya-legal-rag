// titles are printed in caps, filenames read better in title case
const SMALL = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'before',
  'but',
  'by',
  'etc',
  'for',
  'from',
  'in',
  'into',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'under',
  'upon',
  'with',
])

export function toTitleCase(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  return words
    .map((word, i) => {
      const bare = word.replace(/[^a-z]/g, '')
      if (i > 0 && SMALL.has(bare)) return word
      // hyphenated pairs get both halves capitalised, eg bail-bond. the leading
      // run skips any stray punctuation the title started with
      return word.replace(/(^[^a-z]*|-)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
    })
    .join(' ')
}

export function slugify(text) {
  return toTitleCase(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function formFilename(number, title) {
  return `FORM-${number}_${slugify(title)}.pdf`
}
