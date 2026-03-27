import { NextRequest, NextResponse } from 'next/server'
import pdf from 'pdf-parse'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const MONTH_ABBREVS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

function parseMonthName(str: string): number {
  const lower = str.toLowerCase()
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (MONTH_NAMES[i].toLowerCase() === lower || MONTH_ABBREVS[i].toLowerCase() === lower) {
      return i
    }
  }
  return -1
}

function extractDate(text: string): string | null {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoMatch) return isoMatch[1]

  const monthNamePattern = MONTH_NAMES.join('|')
  const monthAbbrPattern = MONTH_ABBREVS.join('|')
  const longDateRe = new RegExp(`\\b(${monthNamePattern}|${monthAbbrPattern})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i')
  const longMatch = text.match(longDateRe)
  if (longMatch) {
    const monthIndex = parseMonthName(longMatch[1])
    const day = parseInt(longMatch[2], 10)
    const year = parseInt(longMatch[3], 10)
    if (monthIndex >= 0) {
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const dayFirstRe = new RegExp(`\\b(\\d{1,2})\\s+(${monthNamePattern}|${monthAbbrPattern}),?\\s+(\\d{4})\\b`, 'i')
  const dayFirstMatch = text.match(dayFirstRe)
  if (dayFirstMatch) {
    const day = parseInt(dayFirstMatch[1], 10)
    const monthIndex = parseMonthName(dayFirstMatch[2])
    const year = parseInt(dayFirstMatch[3], 10)
    if (monthIndex >= 0) {
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const usDateMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (usDateMatch) {
    const month = parseInt(usDateMatch[1], 10)
    const day = parseInt(usDateMatch[2], 10)
    const year = parseInt(usDateMatch[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return null
}

function extractAmount(text: string, customLabels?: string[]): number | null {
  if (customLabels && customLabels.length > 0) {
    for (const label of customLabels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`${escaped}[:\\s]*\\$?([\\d,]+\\.\\d{2})`, 'i')
      const match = text.match(pattern)
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''))
        if (!isNaN(amount) && amount > 0) return amount
      }
    }
  }

  const totalPatterns = [
    /total\s+due\s+by\s+auto\s*pay[:\s]*\$?([\d,]+\.\d{2})/i,
    /(?:total|amount)\s+debited[:\s]*\$?([\d,]+\.\d{2})/i,
    /(?:total|amount)\s+charged[:\s]*\$?([\d,]+\.\d{2})/i,
    /pay\s+this\s+amount[:\s]*\$?([\d,]+\.\d{2})/i,
    /payment\s+amount[:\s]*\$?([\d,]+\.\d{2})/i,
    /net\s+amount[:\s]*\$?([\d,]+\.\d{2})/i,
    /(?:total\s+amount|total\s+due|amount\s+due|balance\s+due|grand\s+total|invoice\s+total)[:\s]*\$?([\d,]+\.\d{2})/i,
    /\btotal[:\s]*\$?([\d,]+\.\d{2})/i,
    /\$?([\d,]+\.\d{2})\s*(?:total|due)/i,
    /current\s+charges[:\s]*\$?([\d,]+\.\d{2})/i,
    /new\s+(?:charges|balance)[:\s]*\$?([\d,]+\.\d{2})/i
  ]

  for (const pattern of totalPatterns) {
    const match = text.match(pattern)
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(amount) && amount > 0) return amount
    }
  }

  const amountMatches = text.match(/\$\s*([\d,]+\.\d{2})/g)
  if (amountMatches && amountMatches.length > 0) {
    let largest = 0
    for (const m of amountMatches) {
      const val = parseFloat(m.replace(/[$,\s]/g, ''))
      if (!isNaN(val) && val > largest) largest = val
    }
    if (largest > 0) return largest
  }

  return null
}

function extractVendor(text: string): string | null {
  const fromMatch = text.match(/(?:from|billed?\s+by|issued\s+by|seller|provider)[:\s]+([^\n]{3,50})/i)
  if (fromMatch) {
    const vendor = fromMatch[1].trim().replace(/[,.]$/, '')
    if (vendor.length >= 2) return vendor
  }

  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    if (firstLine.length >= 2 && firstLine.length <= 60 && /[a-zA-Z]/.test(firstLine) &&
      !/^\d{1,2}[\/\-]/.test(firstLine) && !/^invoice/i.test(firstLine)) {
      return firstLine.replace(/[,.]$/, '')
    }
  }

  return null
}

function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /(?:invoice\s*(?:number|no\.?|#|num))[:\s]*([A-Za-z0-9\-_]+)/i,
    /(?:ref(?:erence)?\s*(?:number|no\.?|#|num)?)[:\s]*([A-Za-z0-9\-_]+)/i,
    /(?:order\s*(?:number|no\.?|#|num)?)[:\s]*([A-Za-z0-9\-_]+)/i,
    /(?:bill\s*(?:number|no\.?|#))[:\s]*([A-Za-z0-9\-_]+)/i,
    /#\s*([A-Za-z0-9\-_]{4,})/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }

  return null
}

function extractBillingPeriod(text: string): { month: number; year: number } | null {
  const monthPattern = `(?:${MONTH_NAMES.join('|')}|${MONTH_ABBREVS.join('|')})`

  const rangeRe = new RegExp(
    `(${monthPattern})\\s+(\\d{1,2})\\s*[\\-\\u2013\\u2014]\\s*(${monthPattern})\\s+(\\d{1,2}),?\\s*(\\d{4})`, 'i'
  )
  const rangeMatch = text.match(rangeRe)
  if (rangeMatch) {
    const endMonthIndex = parseMonthName(rangeMatch[3])
    const year = parseInt(rangeMatch[5], 10)
    if (endMonthIndex >= 0) return { month: endMonthIndex + 1, year }
  }

  const sameMonthRe = new RegExp(
    `(${monthPattern})\\s+(\\d{1,2})\\s*[\\-\\u2013\\u2014]\\s*(\\d{1,2}),?\\s*(\\d{4})`, 'i'
  )
  const sameMonthMatch = text.match(sameMonthRe)
  if (sameMonthMatch) {
    const monthIndex = parseMonthName(sameMonthMatch[1])
    const year = parseInt(sameMonthMatch[4], 10)
    if (monthIndex >= 0) return { month: monthIndex + 1, year }
  }

  const periodRe = new RegExp(`(?:billing\\s+)?period[:\\s]+(${monthPattern})\\s+(\\d{4})`, 'i')
  const periodMatch = text.match(periodRe)
  if (periodMatch) {
    const monthIndex = parseMonthName(periodMatch[1])
    const year = parseInt(periodMatch[2], 10)
    if (monthIndex >= 0) return { month: monthIndex + 1, year }
  }

  return null
}

function detectDirection(text: string): 'incoming' | 'outgoing' {
  const incomingPatterns = [
    /bill\s*(?:ed\s+)?to[:\s]+(?:.*?)accurat/i,
    /issued\s+to[:\s]+(?:.*?)(?:gabriele|accurat)/i,
    /sold\s+to[:\s]+(?:.*?)(?:gabriele|accurat)/i,
    /ship\s*(?:ped\s+)?to[:\s]+(?:.*?)(?:gabriele|accurat)/i,
    /customer[:\s]+(?:.*?)(?:gabriele|accurat)/i,
  ]

  const outgoingPatterns = [
    /from[:\s]+(?:.*?)accurat/i,
    /billed?\s+by[:\s]+(?:.*?)accurat/i,
    /issued\s+by[:\s]+(?:.*?)accurat/i,
  ]

  for (const pattern of incomingPatterns) {
    if (pattern.test(text)) return 'incoming'
  }
  for (const pattern of outgoingPatterns) {
    if (pattern.test(text)) return 'outgoing'
  }
  return 'incoming'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const customLabelsStr = formData.get('customAmountLabels') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await pdf(buffer)
    const text = data.text

    const customLabels = customLabelsStr ? JSON.parse(customLabelsStr) : []

    const result = {
      text,
      date: extractDate(text),
      amount: extractAmount(text, customLabels),
      vendor: extractVendor(text),
      invoiceNumber: extractInvoiceNumber(text),
      billingPeriod: extractBillingPeriod(text),
      direction: detectDirection(text)
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract PDF' },
      { status: 500 }
    )
  }
}
