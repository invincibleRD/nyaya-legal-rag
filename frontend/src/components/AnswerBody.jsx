import { Children, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CitationChip, { PendingChip } from './CitationChip.jsx'
import { splitMarkers } from '../lib/citations.js'

// swaps [BNSS s.103(1)] style markers inside text runs for chips
function chipify(children, ctx) {
  return Children.map(children, (child) => {
    if (typeof child !== 'string') return child
    return splitMarkers(child).map((part, i) => {
      if (!part.marker) return part.text
      const citation = ctx.byMarker.get(part.marker)
      if (citation)
        return (
          <CitationChip
            key={i}
            citation={citation}
            onOpen={ctx.onOpen}
            active={ctx.activeMarker === part.marker}
          />
        )
      return ctx.streaming ? <PendingChip key={i} label={part.marker} /> : part.marker
    })
  })
}

export default function AnswerBody({ text, byMarker, onOpen, activeMarker, streaming }) {
  const components = useMemo(() => {
    const ctx = { byMarker, onOpen, activeMarker, streaming }
    // react-markdown hands each element a `node` prop the DOM does not want
    const wrap =
      (Tag) =>
      ({ node, children, ...rest }) => <Tag {...rest}>{chipify(children, ctx)}</Tag>
    return { p: wrap('p'), li: wrap('li'), td: wrap('td') }
  }, [byMarker, onOpen, activeMarker, streaming])

  return (
    <div className="prose-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
