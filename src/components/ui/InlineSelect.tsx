'use client'
import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, X, Search } from 'lucide-react'

interface Option {
  value: string
  label: string
  color?: string
  icon?: React.ReactNode
}

interface InlineSelectProps {
  value: string | null
  options: Option[]
  onChange: (value: string | null) => void
  placeholder?: string
  allowClear?: boolean
  searchable?: boolean
  renderValue?: (option: Option) => React.ReactNode
}

export default function InlineSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  allowClear = true,
  searchable = false,
  renderValue
}: InlineSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && searchable && searchRef.current) {
      searchRef.current.focus()
    }
  }, [isOpen, searchable])

  const selected = options.find((o) => o.value === value)
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="flex items-center gap-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1.5 py-0.5 transition-colors min-w-0 max-w-full group"
      >
        {selected ? (
          renderValue ? (
            renderValue(selected)
          ) : (
            <span className="truncate">{selected.label}</span>
          )
        ) : (
          <span className="text-gray-400 truncate">{placeholder}</span>
        )}
        <ChevronDown size={12} className="text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 max-h-60 overflow-hidden flex flex-col"
          style={{ left: 0 }}
        >
          {searchable && (
            <div className="px-2 py-1.5 border-b border-gray-100 dark:border-gray-700">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {allowClear && value && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                  setIsOpen(false)
                  setSearch('')
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <X size={12} />
                Clear
              </button>
            )}
            {filtered.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(option.value)
                  setIsOpen(false)
                  setSearch('')
                }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors ${
                  option.value === value ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400' : ''
                }`}
              >
                {option.color && (
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: option.color }}
                  />
                )}
                {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                <span className="truncate">{option.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 text-center">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
