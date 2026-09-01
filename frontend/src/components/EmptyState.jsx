import { Scales } from './Icons.jsx'

const EXAMPLES = [
  {
    q: 'What does BNSS section 103 say about search of a closed place?',
    hint: 'direct section lookup',
  },
  {
    q: 'How long can the police detain a person before producing them before a magistrate?',
    hint: 'procedure question',
  },
  { q: 'Which forms are used for a summons to an accused person?', hint: 'statutory forms' },
  { q: 'Is section 351 bailable?', hint: 'First Schedule' },
]

export default function EmptyState({ onPick }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10">
      <div className="w-full max-w-2xl animate-fadeUp text-center">
        <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-ink-200 bg-white text-brass-500 shadow-lift dark:border-ink-700 dark:bg-ink-800">
          <Scales width={22} height={22} />
        </span>

        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight">
          Ask about the BNSS, 2023
        </h1>
        <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-ink-600 dark:text-ink-400">
          Every answer cites the exact section and page it came from. Upload a PDF to search your
          own case papers alongside the statute.
        </p>

        <ul className="mt-8 grid gap-2 text-left sm:grid-cols-2">
          {EXAMPLES.map(({ q, hint }, i) => (
            <li key={q} className="animate-fadeUp" style={{ animationDelay: `${60 + i * 45}ms` }}>
              <button
                onClick={() => onPick(q)}
                className="card group h-full w-full p-3.5 text-left hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-lift dark:hover:border-ink-600"
              >
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-brass-600 dark:text-brass-400">
                  {hint}
                </span>
                <span className="mt-1 block text-sm leading-snug text-ink-800 dark:text-ink-100">
                  {q}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
