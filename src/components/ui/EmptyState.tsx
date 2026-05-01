import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  className?: string
}

/**
 * Page/section empty-state placeholder.
 *
 *   <EmptyState
 *     icon={FileText}
 *     title="No documents yet"
 *     description="Upload a PDF to get started."
 *     action={{ label: 'Upload', onClick: handleUpload }}
 *   />
 */
export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {Icon && (
        <div className="mb-3 p-3 rounded-full bg-gray-100 dark:bg-gray-800">
          <Icon size={24} className="text-gray-400" />
        </div>
      )}
      <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">{description}</p>
      )}
      {action && (
        <button onClick={action.onClick} className="btn-primary btn-sm mt-4">
          {action.label}
        </button>
      )}
    </div>
  )
}
