'use client'

import { useRef, type KeyboardEvent } from 'react'

import { cn } from '@/lib/cn'

/**
 * Radio group in segmented clothing: used for "Herzfrequenz | Leistung" and for
 * the period pickers. Roving tabindex — the group is one tab stop and the arrow
 * keys move and select, which is what screen reader users expect from radios.
 */

const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-plane'

export interface SegmentedOption<T extends string> {
  value: T
  /** German label. */
  label: string
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** German group name for assistive technology, e.g. "Messgröße". */
  label: string
  size?: 'sm' | 'md'
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  const selectedIndex = options.findIndex((option) => option.value === value)
  const firstEnabled = options.findIndex((option) => !option.disabled)
  // Without a valid selection the first enabled segment holds the tab stop.
  const tabStopIndex = selectedIndex >= 0 ? selectedIndex : firstEnabled

  function step(from: number, direction: 1 | -1): number {
    const count = options.length
    if (count === 0) return from
    for (let offset = 1; offset <= count; offset += 1) {
      const index = (((from + direction * offset) % count) + count) % count
      const option = options[index]
      if (option !== undefined && option.disabled !== true) return index
    }
    return from
  }

  function edge(direction: 1 | -1): number {
    return direction === 1 ? step(-1, 1) : step(0, -1)
  }

  function select(index: number): void {
    const option = options[index]
    if (option === undefined || option.disabled === true) return
    onChange(option.value)
    buttonsRef.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let target: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = step(index, 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        target = step(index, -1)
        break
      case 'Home':
        target = edge(1)
        break
      case 'End':
        target = edge(-1)
        break
      default:
        return
    }
    event.preventDefault()
    select(target)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-border-hair bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonsRef.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={option.disabled === true}
            tabIndex={index === tabStopIndex ? 0 : -1}
            onClick={() => {
              select(index)
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, index)
            }}
            className={cn(
              'rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              isSelected
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-secondary hover:text-ink',
              FOCUS_RING,
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
