'use client'
import React, { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface MonthYearPickerProps {
  value: { month: number; year: number } | null
  onChange: (value: { month: number; year: number } | null) => void
  placeholder?: string
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function MonthYearPicker({ value, onChange, placeholder = '—' }: MonthYearPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewYear, setViewYear] = useState(value?.year || new Date().getFullYear())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayValue = value ? `${MONTHS_SHORT[value.month - 1]} ${value.year}` : placeholder

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
          if (!isOpen && value) setViewYear(value.year)
        }}
        className="text-sm hover:bg-[var(--c-gray-100)] rounded px-1.5 py-0.5 transition-colors text-gray-600"
      >
        {displayValue}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setViewYear((y) => y - 1)}
              className="p-0.5 hover:bg-[var(--c-gray-100)] rounded"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold">{viewYear}</span>
            <button
              onClick={() => setViewYear((y) => y + 1)}
              className="p-0.5 hover:bg-[var(--c-gray-100)] rounded"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {MONTHS_SHORT.map((month, idx) => {
              const isSelected = value?.month === idx + 1 && value?.year === viewYear
              return (
                <button
                  key={month}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange({ month: idx + 1, year: viewYear })
                    setIsOpen(false)
                  }}
                  className={`text-xs py-1.5 rounded transition-colors ${
                    isSelected
                      ? 'bg-[var(--c-gray-900)] text-white'
                      : 'hover:bg-[var(--c-gray-100)] text-gray-700'
                  }`}
                >
                  {month}
                </button>
              )
            })}
          </div>

          {value && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
                setIsOpen(false)
              }}
              className="w-full mt-2 text-xs text-gray-400 hover flex items-center justify-center gap-1 py-1"
            >
              <X size={10} />
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
