export function ListSkeleton({ rows = 5 }) {
  return (
    <ul className="space-y-1.5 p-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="skeleton h-8" style={{ opacity: 1 - i * 0.14 }} />
      ))}
    </ul>
  )
}

export function MessagesSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8" aria-hidden>
      <div className="flex justify-end">
        <div className="skeleton h-10 w-2/5 rounded-3xl" />
      </div>
      <div className="flex gap-3">
        <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2.5">
          <div className="skeleton h-4 w-11/12" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-4/5" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      </div>
    </div>
  )
}

export function FormsSkeleton({ rows = 6 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-8 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}
