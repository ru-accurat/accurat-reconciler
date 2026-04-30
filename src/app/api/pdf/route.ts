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

// Try a list of caller-supplied labels first. The label is the literal phrase
// that, in this vendor's template, precedes the actual posted date. Format
// detection mirrors extractDate. Returns the first hit; falls through if none.
function extractDateWithCustomLabels(text: string, customLabels?: string[]): string | null {
  if (!customLabels || customLabels.length === 0) return null
  for (const label of customLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // ISO
    let m = text.match(new RegExp(`${escaped}[:\\s]*\\b(\\d{4}-\\d{2}-\\d{2})\\b`, 'i'))
    if (m) return m[1]
    // US slash
    m = text.match(new RegExp(`${escaped}[:\\s]*\\b(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})\\b`, 'i'))
    if (m) {
      const month = parseInt(m[1], 10), day = parseInt(m[2], 10), year = parseInt(m[3], 10)
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }
    // Month name
    const monthNamePattern = MONTH_NAMES.join('|')
    const monthAbbrPattern = MONTH_ABBREVS.join('|')
    m = text.match(new RegExp(`${escaped}[:\\s]*\\b(${monthNamePattern}|${monthAbbrPattern})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i'))
    if (m) {
      const monthIndex = parseMonthName(m[1])
      const day = parseInt(m[2], 10), year = parseInt(m[3], 10)
      if (monthIndex >= 0) return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return null
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

// "Self" — Accurat. The vendor field always means the counterparty, never us.
// Hardcoded for now; could move to settings later.
const SELF_ALIASES = [
  'accurat', 'accurat usa', 'accurat usa inc', 'accurat usa inc.',
  'accurat srl', 'accurat s.r.l.', 'accurat s.r.l',
]
const SELF_RE = new RegExp(
  `^\\s*(?:${SELF_ALIASES.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*$`,
  'i'
)
function isSelf(name: string): boolean {
  return SELF_RE.test(name)
}

// Sub-labels that sometimes appear on a line by themselves (e.g. "Bill to\nAttn: X").
// These must never end up as a captured business or person name.
const SUBLABEL_STOPWORDS = new Set([
  'attn', 'attention', 'c/o', 'care of', 'to', 'from', 'bill', 'sold', 'ship',
  'mr', 'mrs', 'ms', 'dr',
])

function extractVendor(text: string, entities: ExtractedEntities): string | null {
  // 1. Check explicit labels first (skip if value would be self).
  const fromMatch = text.match(/(?:from|billed?\s+by|issued\s+by|seller|provider)[:\s]+([^\n]{3,50})/i)
  if (fromMatch) {
    const vendor = fromMatch[1].trim().replace(/[,.]$/, '')
    if (vendor.length >= 2 && !isSelf(vendor)) return vendor
  }

  // 2. Use extracted business names, dropping self.
  const nonSelfBusinesses = entities.businessNames.filter(n => !isSelf(n))
  if (nonSelfBusinesses.length > 0) return nonSelfBusinesses[0]

  // 3. Fall back to person names, dropping self.
  const nonSelfPersons = entities.personNames.filter(n => !isSelf(n))
  if (nonSelfPersons.length > 0) return nonSelfPersons[0]

  // 4. First line heuristic (also drops self).
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    if (firstLine.length >= 2 && firstLine.length <= 60 && /[a-zA-Z]/.test(firstLine) &&
      !/^\d{1,2}[\/\-]/.test(firstLine) && !/^invoice/i.test(firstLine) && !isSelf(firstLine)) {
      return firstLine.replace(/[,.]$/, '')
    }
  }

  return null
}

// ---- Entity Extraction ----

interface ExtractedEntities {
  businessNames: string[]
  personNames: string[]
  addresses: string[]
  emails: string[]
  phones: string[]
  vatTaxIds: string[]
}

function extractEntities(text: string): ExtractedEntities {
  return {
    businessNames: extractBusinessNames(text),
    personNames: extractPersonNames(text),
    addresses: extractAddresses(text),
    emails: extractEmails(text),
    phones: extractPhones(text),
    vatTaxIds: extractVatTaxIds(text)
  }
}

function extractBusinessNames(text: string): string[] {
  const names = new Set<string>()

  // Pattern 1: Business suffixes (LLC, Inc, Corp, Ltd, etc.)
  const suffixPatterns = [
    /([A-Z][A-Za-z\s&.,'-]{2,50}?\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|Company|LP|L\.P\.|LLP|L\.L\.P\.|Group|Holdings|Partners|Associates|Services|Solutions|Enterprises|International|Consulting|Management|Industries|Technologies|Agency|Studio|Labs?))\b/g,
    // Italian business suffixes
    /([A-Z][A-Za-z\s&.,'-]{2,50}?\s+(?:S\.r\.l\.?|S\.p\.A\.?|S\.a\.s\.?|S\.n\.c\.?|S\.r\.l\.s\.?|SRL|SPA|SAS|SNC))\b/g
  ]

  for (const pattern of suffixPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim().replace(/^[,.\s]+|[,.\s]+$/g, '')
      if (name.length >= 3 && name.length <= 80) names.add(name)
    }
  }

  // Pattern 2: Names near labels (Bill To, From, Customer, Vendor, etc.)
  // Note: "Attention"/"Attn" are person-name labels — they live in extractPersonNames.
  const labelPatterns = [
    /(?:bill(?:ed)?\s+to|sold\s+to|ship(?:ped)?\s+to|customer|client)[:\s]+([A-Z][A-Za-z\s&.,'-]{2,60})/gi,
    /(?:from|billed?\s+by|issued\s+by|seller|provider|vendor|payee|company)[:\s]+([A-Z][A-Za-z\s&.,'-]{2,60})/gi
  ]

  for (const pattern of labelPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      // Take only the first line of the match
      const firstLine = match[1].split('\n')[0].trim().replace(/[,.]$/, '')
      // Drop sublabel artifacts: when layout is "Bill to\nAttn: Name", the regex above
      // eats the newline via `[:\s]+` and captures just "Attn" before stopping at the colon.
      if (firstLine.length >= 2 && firstLine.length <= 60 && /[a-zA-Z]{2,}/.test(firstLine) &&
          !SUBLABEL_STOPWORDS.has(firstLine.toLowerCase())) {
        names.add(firstLine)
      }
    }
  }

  // Pattern 3: Standalone capitalized multi-word names at start of lines (company letterhead)
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim()
    // All-caps or title-case line that looks like a company name
    if (/^[A-Z][A-Za-z\s&.,'-]{2,50}$/.test(line) && !/^\d/.test(line) &&
      !/^(invoice|receipt|statement|bill|order|date|page|total|amount|due)/i.test(line)) {
      names.add(line.replace(/[,.]$/, ''))
    }
  }

  return [...names]
}

function extractPersonNames(text: string): string[] {
  const names = new Set<string>()

  // Names near labels (Attention, Contact, Prepared for, etc.)
  const labelPatterns = [
    /(?:attention|attn|contact|prepared\s+for|care\s+of|c\/o)[:\s]+([A-Z][a-z]+\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]+)/gi,
    /(?:bill(?:ed)?\s+to|sold\s+to)[:\s]*\n?\s*([A-Z][a-z]+\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]+)/gi
  ]

  for (const pattern of labelPatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim()
      // Filter out common false positives
      if (name.length >= 4 && name.length <= 40 &&
        !/^(Invoice Number|Total Amount|Due Date|Bill To|Order Number)/i.test(name)) {
        names.add(name)
      }
    }
  }

  // Standalone "Firstname Lastname" pattern (Title Case, 2-3 words)
  const namePattern = /\b([A-Z][a-z]{1,15}\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]{1,15})\b/g
  let match
  const commonWords = new Set([
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December', 'Monday', 'Tuesday',
    'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'New York',
    'Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Las Vegas',
    'El Paso', 'Santa Monica', 'United States', 'North America', 'South America',
    'Total Amount', 'Due Date', 'Invoice Number', 'Order Number', 'Account Number',
    'Credit Card', 'Purchase Order', 'Billing Period', 'Payment Method',
    'Tax Rate', 'Sub Total', 'Grand Total', 'Net Amount'
  ])
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1]
    if (!commonWords.has(name) && !/^\d/.test(name)) {
      // Only take names found near person-related context
      const contextStart = Math.max(0, match.index - 50)
      const context = text.substring(contextStart, match.index).toLowerCase()
      if (/(?:attention|attn|contact|name|dear|mr\.?|mrs\.?|ms\.?|dr\.?|prepared|signed|from|to)/.test(context)) {
        names.add(name)
      }
    }
  }

  return [...names]
}

function extractAddresses(text: string): string[] {
  const addresses: string[] = []

  // US address pattern: number + street, city, state zip
  const usAddressPattern = /(\d{1,5}\s+[A-Za-z\s.,'-]{3,40}(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Road|Rd\.?|Lane|Ln\.?|Way|Court|Ct\.?|Circle|Cir\.?|Place|Pl\.?|Terrace|Ter\.?|Trail|Trl\.?|Parkway|Pkwy\.?|Highway|Hwy\.?)[\s,]*(?:[A-Za-z\s]+,?\s*)?[A-Z]{2}\s+\d{5}(?:-\d{4})?)/gi
  let match
  while ((match = usAddressPattern.exec(text)) !== null) {
    addresses.push(match[1].replace(/\s+/g, ' ').trim())
  }

  // Simpler US address: look for lines with street + city/state/zip pattern
  const lines = text.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim()
    const nextLine = (lines[i + 1] || '').trim()

    // Street line + City, ST ZIP line
    if (/^\d{1,5}\s+[A-Za-z\s.,'-]{3,40}(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Road|Rd\.?|Lane|Ln\.?|Way|Suite|Ste\.?|Floor|Fl\.?|Unit|Apt\.?|#)/i.test(line)) {
      const cityStateZip = nextLine.match(/^([A-Za-z\s]+),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/)
      if (cityStateZip) {
        addresses.push(`${line}, ${nextLine}`)
        continue
      }
    }

    // Italian/EU address: Via/Corso/Piazza + city + CAP
    if (/^(?:Via|Corso|Piazza|Piazzale|Viale|Largo|Vicolo|Strada)\s+[A-Za-zÀ-ÿ\s.,'-]{3,40}/i.test(line)) {
      const capLine = nextLine.match(/^(\d{5})\s+([A-Za-zÀ-ÿ\s]+)/)
      if (capLine) {
        addresses.push(`${line}, ${nextLine}`)
      } else {
        addresses.push(line)
      }
    }
  }

  // Labeled addresses
  const labeledPattern = /(?:address|location|headquarters|office)[:\s]+([^\n]{10,80}(?:\n[^\n]{5,80}){0,2})/gi
  while ((match = labeledPattern.exec(text)) !== null) {
    const addr = match[1].split('\n').map(l => l.trim()).filter(l => l.length > 0).join(', ')
    if (addr.length >= 10 && addr.length <= 200) addresses.push(addr)
  }

  // Deduplicate
  const unique = [...new Set(addresses.map(a => a.replace(/\s+/g, ' ').trim()))]
  return unique.slice(0, 5) // Max 5 addresses
}

function extractEmails(text: string): string[] {
  const emails = new Set<string>()
  const emailPattern = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g
  let match
  while ((match = emailPattern.exec(text)) !== null) {
    const email = match[0].toLowerCase()
    // Filter out common non-person emails
    if (!/^(noreply|no-reply|donotreply|support@|info@|help@|admin@|billing@|sales@)/.test(email)) {
      emails.add(email)
    }
  }
  // Also add the filtered ones as fallback
  const allEmails = text.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g) || []
  for (const e of allEmails) emails.add(e.toLowerCase())
  return [...emails].slice(0, 5)
}

function extractPhones(text: string): string[] {
  const phones = new Set<string>()
  const phonePatterns = [
    /(?:phone|tel|telephone|fax|call|mobile|cell)[:\s]+([+\d\s().\-]{7,20})/gi,
    /\b(\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4})\b/g,
    /\b(\(\d{3}\)\s*\d{3}[\s.-]\d{4})\b/g
  ]

  for (const pattern of phonePatterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const phone = match[1].trim()
      if (phone.replace(/\D/g, '').length >= 7) phones.add(phone)
    }
  }
  return [...phones].slice(0, 5)
}

function extractVatTaxIds(text: string): string[] {
  const ids = new Set<string>()
  const patterns = [
    // US EIN
    /(?:EIN|employer\s+identification|tax\s+id(?:entification)?|TIN|federal\s+id)[:\s#]*(\d{2}[\s-]?\d{7})/gi,
    // EU VAT
    /(?:VAT|partita\s+iva|P\.?\s*IVA|TVA|USt-IdNr|BTW|NIF)[:\s#]*([A-Z]{2}\s?\d{8,12})/gi,
    // Italian Codice Fiscale / P.IVA (just digits)
    /(?:P\.?\s*IVA|partita\s+iva|codice\s+fiscale|C\.?\s*F\.?)[:\s#]*(\d{11}|[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])/gi
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      ids.add(match[1].trim())
    }
  }
  return [...ids].slice(0, 3)
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

// Recipient labels — invoice issued TO whoever follows.
const RECIPIENT_LABEL_RE = /^(bill(?:ed)?\s+to|sold\s+to|ship(?:ped)?\s+to|customer|client|issued\s+to)\b[:\s]*(.*)$/i
// Issuer labels — invoice issued BY whoever follows.
const ISSUER_LABEL_RE = /^(from|billed?\s+by|issued\s+by|seller|provider)\b[:\s]*(.*)$/i
// Sub-labels that appear between the recipient label and the actual name and must be skipped.
const SUBLABEL_LINE_RE = /^(attn|attention|c\/o|care\s+of)\b[:\s]*/i
const SELF_HINT_RE = /\b(accurat|gabriele\s+rossi)\b/i

function isSelfLine(line: string): boolean {
  return SELF_HINT_RE.test(line) || isSelf(line.replace(/[,].*$/, '').trim())
}

// Take the value chunk that follows a label on the same line, stripping
// any leading "Attn:" / "Attention:" sub-label.
function stripSublabel(s: string): string {
  return s.replace(SUBLABEL_LINE_RE, '').trim()
}

// Walk forward from `startIdx` (exclusive) through up to `maxLookahead`
// non-empty lines, skipping sublabel lines, returning the first concrete
// line of content (or null).
function nextContentLine(lines: string[], startIdx: number, maxLookahead = 4): string | null {
  for (let i = startIdx + 1; i < Math.min(lines.length, startIdx + 1 + maxLookahead); i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (SUBLABEL_LINE_RE.test(line)) {
      // "Attn: <name>" — value may be on the same line after the sublabel
      const after = stripSublabel(line)
      if (after) return after
      continue  // bare "Attn:" with value on the next line
    }
    return line
  }
  return null
}

function detectDirection(text: string): 'incoming' | 'outgoing' {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // Phase 1: anchor on a recipient label. Whoever follows it (skipping
  // sublabels) is who the invoice is billed TO. If that's us → incoming.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(RECIPIENT_LABEL_RE)
    if (!m) continue
    let recipient = stripSublabel(m[2] ?? '')
    if (!recipient) {
      // Label was alone on the line; look ahead.
      recipient = nextContentLine(lines, i) ?? ''
    }
    if (!recipient) continue
    return isSelfLine(recipient) ? 'incoming' : 'outgoing'
  }

  // Phase 2: no recipient label found. Try issuer labels — if the issuer
  // is us, this is outgoing.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ISSUER_LABEL_RE)
    if (!m) continue
    let issuer = stripSublabel(m[2] ?? '')
    if (!issuer) issuer = nextContentLine(lines, i) ?? ''
    if (!issuer) continue
    return isSelfLine(issuer) ? 'outgoing' : 'incoming'
  }

  // Phase 3: nothing labeled. If "Accurat" appears at all, assume it's
  // our letterhead → outgoing. Otherwise default to incoming (the safer
  // assumption for unlabeled receipts/bills).
  if (SELF_HINT_RE.test(text)) return 'outgoing'
  return 'incoming'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const customLabelsStr = formData.get('customAmountLabels') as string | null
    const customDateLabelsStr = formData.get('customDateLabels') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await pdf(buffer)
    const text = data.text

    const customLabels = customLabelsStr ? JSON.parse(customLabelsStr) : []
    const customDateLabels = customDateLabelsStr ? JSON.parse(customDateLabelsStr) : []

    const entities = extractEntities(text)

    // Custom date labels (vendor-learned) win when they match; otherwise fall back to the generic extractor.
    const date = extractDateWithCustomLabels(text, customDateLabels) ?? extractDate(text)

    const result = {
      text,
      date,
      amount: extractAmount(text, customLabels),
      vendor: extractVendor(text, entities),
      invoiceNumber: extractInvoiceNumber(text),
      billingPeriod: extractBillingPeriod(text),
      direction: detectDirection(text),
      entities
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract PDF' },
      { status: 500 }
    )
  }
}
