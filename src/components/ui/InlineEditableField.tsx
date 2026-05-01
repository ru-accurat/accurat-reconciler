'use client'
import React, { useState, useRef, useEffect } from 'react'
import { Pencil } from 'lucide-react'

interface InlineEditableFieldProps {
  value: string
  onSave: (next: string) => void
  placeholder?: string
  multiline?: boolean
  className?: string
  /** Show a small pencil icon on hover to hint editability. */
  showHint?: boolean
}

/**
 * Click-to-edit text field.  Renders the value as plain text until clicked,
 * then swaps to an input/textarea.  Saves on blur or Enter (Shift-Enter
 * inserts a newline in multiline mode); discards on Escape.
 *
 * Used for transaction notes, contact fields, category names — anywhere
 * editing should be a single click rather than entering an edit mode.
 */
export function InlineEditableField({
  value, onSave, placeholder = 'Click to edit', multiline = false, className = '', showHint = true,
}: InlineEditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editing) {
      setDraft(value)
      // Focus on the next tick so the input is mounted.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [editing, value])

  const commit = () => {
    if (draft !== value) onSave(draft)
    setEditing(false)
  }
  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`group inline-flex items-center gap-1 text-left px-1 -mx-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 ${className}`}
      >
        <span className={value ? '' : 'italic text-gray-400'}>{value || placeholder}</span>
        {showHint && (
          <Pencil size={11} className="text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    )
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
    else if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); commit() }
  }

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`input-field text-sm w-full resize-y min-h-[60px] ${className}`}
      />
    )
  }
  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={`input-field text-sm w-full ${className}`}
    />
  )
}
