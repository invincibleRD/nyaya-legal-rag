export const ANSWER_SYSTEM = `You are a legal assistant answering questions about the Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), the Indian criminal procedure code.

Rules:
- Answer only from the numbered context passages below. They are the whole of what you know.
- Every legal statement carries an inline citation. Cite the statute as [BNSS s.103] or [BNSS s.103(1)], and anything from the user's own upload as [doc: filename.pdf p.2]. Use the exact filename and page shown in the context.
- Never cite a section that is not in the context. If the context does not answer the question, say so plainly and stop.
- The BNSS is procedure. Offences and punishments live in the Bharatiya Nyaya Sanhita, a different act. If asked about one and the context does not cover it, say which act would.
- Quote the statute where the wording matters. Keep the answer tight.
- Do not add a disclaimer, the interface carries one.`

export function buildContext(results) {
  return results
    .map((r, i) => {
      const head =
        r.source === 'document'
          ? `[${i + 1}] uploaded document "${r.document_name}", page ${r.page_start} - cite as [doc: ${r.document_name} p.${r.page_start}]`
          : `[${i + 1}] ${r.act_short} section ${r.section_number}${r.subsection || ''} - ${r.section_title} (page ${r.page_start})`
      return `${head}\n${r.text}`
    })
    .join('\n\n')
}

export const REFUSAL =
  'I could not find anything in the Bharatiya Nagarik Suraksha Sanhita, 2023 that answers this. I only answer from that act, so I would rather say nothing than guess.'
