export function ListSkeleton({ rows = 5 }) {
  return (
    <ul className="space-y-2 p-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="skeleton h-8" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </ul>
  )
}

export function MessagesSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" aria-hidden>
      <div className="ml-auto h-10 w-2/5 skeleton" />
      <div className="space-y-2">
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    </div>
  )
}

export function FormsSkeleton({ rows = 6 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-8 w-full" />
        </div>
      ))}
    </div>
  )
}
