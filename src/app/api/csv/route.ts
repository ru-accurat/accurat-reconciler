import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import Papa from 'papaparse'

interface ChaseRow {
  Status: string
  Date: string
  Description: string
  Debit: string
  Credit: string
}

function generateTransactionHash(date: string, amount: number, description: string): string {
  const normalizedDesc = description.trim().replace(/\s+/g, ' ').toLowerCase()
  const input = `${date}|${Math.abs(amount).toFixed(2)}|${normalizedDesc}`
  return createHash('sha256').update(input).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileContent = await file.text()

    const parsed = Papa.parse<ChaseRow>(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim()
    })

    const results = []

    for (const row of parsed.data) {
      if (!row.Date || (!row.Debit && !row.Credit)) continue

      const dateParts = row.Date.trim().split('-')
      if (dateParts.length !== 3) continue
      const [month, day, year] = dateParts
      const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`

      const debitStr = (row.Debit || '').replace(/,/g, '').trim()
      const creditStr = (row.Credit || '').replace(/,/g, '').trim()
      const debit = debitStr ? parseFloat(debitStr) : 0
      const credit = creditStr ? parseFloat(creditStr) : 0

      if (isNaN(debit) && isNaN(credit)) continue
      const amount = credit > 0 ? credit : -(debit || 0)
      const type = credit > 0 ? 'credit' : 'debit'

      const rawDescription = (row.Description || '').trim()
      const hash = generateTransactionHash(isoDate, amount, rawDescription)

      results.push({ date: isoDate, rawDescription, amount, type, hash })
    }

    return NextResponse.json({ transactions: results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse CSV' },
      { status: 500 }
    )
  }
}
