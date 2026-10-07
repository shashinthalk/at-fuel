// App-style building blocks for phones and tablets: bottom sheet, tab bar.
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useDragToClose, useScrollLock } from '../hooks/useSheet'

export function GrabHandle({ handle, className }: { handle: ReturnType<typeof useDragToClose>['handle']; className?: string }) {
  return (
    <div {...handle} className={clsx('flex shrink-0 cursor-grab justify-center pt-2.5 pb-1.5 active:cursor-grabbing', className)} aria-hidden>
      <span className="h-1.5 w-10 rounded-full bg-line" />
    </div>
  )
}

/** Modal sheet that slides up from the bottom; drag the handle down to close. */
export function BottomSheet({
  title,
  icon,
  onClose,
  children,
  footer,
}: {
  title: ReactNode
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const { ref, handle } = useDragToClose<HTMLDivElement>(onClose)
  useScrollLock()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center" role="dialog" aria-modal>
      <div className="fade-in absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} className="sheet-up relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[28px] bg-surface shadow-2xl">
        <div {...handle}>
          <GrabHandle handle={handle} className="pointer-events-none" />
          <div className="flex items-center justify-between px-5 pb-3">
            <span className="flex items-center gap-2 text-base font-semibold">
              {icon}
              {title}
            </span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClose}
              className="grid size-9 place-items-center rounded-full bg-sunken text-muted active:scale-95"
              aria-label="Close"
            >
              <X className="size-4.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line bg-surface px-4 pt-3 [&>*]:mb-3">{footer}</div>}
      </div>
    </div>
  )
}

export interface Tab<T extends string> {
  id: T
  label: string
  icon: ReactNode
  badge?: number
}

/** Fixed bottom navigation, hidden on desktop. */
export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: Tab<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <nav
      aria-label="Views"
      className="pb-safe fixed inset-x-0 bottom-0 z-[1200] border-t border-line bg-surface/90 backdrop-blur-xl select-none lg:hidden"
    >
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = t.id === value
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (active) window.scrollTo({ top: 0, behavior: 'smooth' })
                else onChange(t.id)
              }}
              aria-current={active ? 'page' : undefined}
              className={clsx('flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-medium transition-colors', active ? 'text-accent' : 'text-muted')}
            >
              <span className={clsx('relative grid h-7 w-14 place-items-center rounded-full transition-all duration-200', active ? 'bg-accent/12 scale-100' : 'scale-95')}>
                {t.icon}
                {!!t.badge && (
                  <span className="absolute -top-0.5 right-2 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-white ring-2 ring-surface">
                    {t.badge}
                  </span>
                )}
              </span>
              {t.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
