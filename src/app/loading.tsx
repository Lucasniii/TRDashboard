import type { ReactElement } from 'react'

function Block({ className }: { className: string }): ReactElement {
  return <div className={`rounded-lg bg-surface-2 ${className}`} />
}

export default function Loading(): ReactElement {
  return (
    <div role="status" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Inhalte werden geladen</span>

      <Block className="h-7 w-48" />
      <Block className="mt-3 h-4 w-72 max-w-full" />

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="rounded-xl border border-border-hair bg-surface p-5">
            <Block className="h-3.5 w-24" />
            <Block className="mt-4 h-8 w-32" />
            <Block className="mt-3 h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-border-hair bg-surface p-5 xl:col-span-2">
          <Block className="h-3.5 w-40" />
          <Block className="mt-5 h-64 w-full" />
        </div>
        <div className="rounded-xl border border-border-hair bg-surface p-5">
          <Block className="h-3.5 w-32" />
          <div className="mt-5 flex flex-col gap-3">
            {[0, 1, 2, 3, 4].map((index) => (
              <Block key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
