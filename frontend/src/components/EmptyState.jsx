const EXAMPLES = [
  'What does BNSS section 103 say about search of a closed place?',
  'How long can the police detain a person before producing them before a magistrate?',
  'Which forms are used for a summons to an accused person?',
  'Compare arrest without warrant under BNSS with the older CrPC position.',
]

export default function EmptyState({ onPick }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 animate-fadeUp flex-col justify-center px-4 py-10">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Ask about the BNSS, 2023</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-700 dark:text-ink-100/60">
        Answers cite the exact section and page they came from. Upload a PDF to search your own case
        papers alongside the statute.
      </p>

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {EXAMPLES.map((q) => (
          <li key={q}>
            <button
              onClick={() => onPick(q)}
              className="card h-full w-full p-3 text-left text-sm transition-colors hover:border-brass-400 hover:bg-brass-500/5"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
