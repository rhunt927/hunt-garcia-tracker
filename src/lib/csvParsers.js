import Papa from 'papaparse'

// Returns { rows, bankName } or throws
export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const headers = meta.fields ?? []
        const parser = detectParser(headers)
        if (!parser) {
          reject(new Error(`Unrecognized CSV format. Headers: ${headers.join(', ')}`))
          return
        }
        try {
          const rows = data.map(parser.parse).filter(Boolean)
          resolve({ rows, bankName: parser.name })
        } catch (e) {
          reject(e)
        }
      },
      error: reject,
    })
  })
}

function detectParser(headers) {
  const h = headers.map(s => s.toLowerCase())
  if (h.includes('transaction date') && h.includes('merchant') && h.includes('purchased by')) return APPLE_CARD
  if (h.includes('transaction date') && h.includes('post date') && h.includes('memo')) return CHASE
  if (h.includes('trans. date') && h.includes('post date')) return DISCOVER
  if (h.includes('posted date') && h.includes('payee') && h.includes('reference number')) return BOA
  if (h.some(c => c.includes('withdrawal')) && h.some(c => c.includes('deposit'))) return SCHWAB
  return GENERIC
}

// MM/DD/YYYY → YYYY-MM-DD
function mmddyyyy(s) {
  if (!s) return null
  const [m, d, y] = s.split('/')
  if (!y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

const APPLE_CARD = {
  name: 'Apple Card',
  parse: (row) => {
    const amount = parseFloat(row['Amount (USD)'])
    if (isNaN(amount) || amount <= 0) return null  // skip payments/credits
    return {
      date: mmddyyyy(row['Transaction Date']),
      merchant: row['Merchant']?.trim() || row['Description']?.trim(),
      description: row['Description']?.trim(),
      amount,
      currency: 'USD',
      amount_usd: amount,
      category: mapAppleCategory(row['Category']),
      payment_method: 'Apple Card',
      source: 'csv_apple',
    }
  },
}

const CHASE = {
  name: 'Chase',
  parse: (row) => {
    const amount = Math.abs(parseFloat(row['Amount']))
    if (isNaN(amount) || amount === 0) return null
    const isCredit = parseFloat(row['Amount']) > 0
    if (isCredit) return null
    return {
      date: mmddyyyy(row['Transaction Date']),
      merchant: row['Description']?.trim(),
      description: row['Memo']?.trim() || null,
      amount,
      currency: 'USD',
      amount_usd: amount,
      category: null,
      payment_method: 'Chase',
      source: 'csv_chase',
    }
  },
}

const DISCOVER = {
  name: 'Discover',
  parse: (row) => {
    const amount = parseFloat(row['Amount'])
    if (isNaN(amount) || amount <= 0) return null
    return {
      date: mmddyyyy(row['Trans. Date']),
      merchant: row['Description']?.trim(),
      description: null,
      amount,
      currency: 'USD',
      amount_usd: amount,
      category: null,
      payment_method: 'Discover',
      source: 'csv_discover',
    }
  },
}

const BOA = {
  name: 'Bank of America',
  parse: (row) => {
    const amount = Math.abs(parseFloat(row['Amount']))
    if (isNaN(amount) || amount === 0) return null
    if (parseFloat(row['Amount']) > 0) return null // credit/deposit
    return {
      date: mmddyyyy(row['Posted Date']),
      merchant: row['Payee']?.trim(),
      description: null,
      amount,
      currency: 'USD',
      amount_usd: amount,
      category: null,
      payment_method: 'BOA Checking',
      source: 'csv_boa',
    }
  },
}

const SCHWAB = {
  name: 'Schwab',
  parse: (row) => {
    const withdrawalKey = Object.keys(row).find(k => k.toLowerCase().includes('withdrawal'))
    const raw = row[withdrawalKey] ?? ''
    const amount = parseFloat(raw.replace(/[$,]/g, ''))
    if (isNaN(amount) || amount <= 0) return null
    const dateKey = Object.keys(row).find(k => k.toLowerCase().includes('date'))
    return {
      date: mmddyyyy(row[dateKey]),
      merchant: row['Description']?.trim(),
      description: null,
      amount,
      currency: 'USD',
      amount_usd: amount,
      category: null,
      payment_method: 'Schwab Checking',
      source: 'csv_schwab',
    }
  },
}

const GENERIC = {
  name: 'Generic',
  parse: (row) => {
    const vals = Object.values(row)
    const amountVal = vals.find(v => /^\$?[\d,]+\.\d{2}$/.test(String(v)?.trim()))
    const amount = amountVal ? parseFloat(String(amountVal).replace(/[$,]/g, '')) : null
    if (!amount || amount <= 0) return null
    const dateVal = vals.find(v => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(String(v)))
    const descKey = Object.keys(row).find(k => /desc|merchant|payee|name/i.test(k))
    return {
      date: dateVal ? mmddyyyy(dateVal) : null,
      merchant: descKey ? row[descKey]?.trim() : null,
      description: null,
      amount,
      currency: 'USD',
      amount_usd: amount,
      category: null,
      payment_method: null,
      source: 'csv_generic',
    }
  },
}

// Map Apple Card categories to our category list
function mapAppleCategory(cat) {
  const map = {
    'Food and Drinks': 'Dining',
    'Groceries': 'Groceries',
    'Shopping': 'Shopping',
    'Entertainment': 'Other',
    'Health': 'Other',
    'Travel': 'Transport',
    'Transportation': 'Transport',
    'Utilities': 'Other',
    'Services': 'Professional Services',
    'Other': 'Other',
  }
  return map[cat] ?? 'Other'
}
