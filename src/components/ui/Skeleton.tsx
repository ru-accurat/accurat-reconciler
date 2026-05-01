import React from 'react'

interface SkeletonProps {
  className?: string
}

/**
 * Single skeleton block.  Sized via Tailwind utility classes from the
 * caller; defaults to a one-line text-row shape.
 *
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-32 w-full" />
 */
export function Skeleton({ className = 'h-4 w-full' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 ${className}`}
      aria-busy="true"
      aria-live="polite"
    />
  )
}

/**
 * Stack of N skeleton lines for table-row placeholders.
 */
export function SkeletonRows({ count = 5, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

/**
 * Card-shaped skeleton — useful for dashboard tiles.
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card p-4 ${className}`}>
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-7 w-32" />
    </div>
  )
}
