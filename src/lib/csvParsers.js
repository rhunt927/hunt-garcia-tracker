import Papa from 'papaparse'

// Returns { rows, bankName } or throws
export function parseTxt(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const rows = parseBofATxt(e.target.result)
        resolve({ rows, bankName: 'Bank of America' })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsText(file)
  })
}

// Two numbers at end of line: amount + running balance
const TX_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s{2,}(-?[\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/

function parseBofATxt(text) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex(l => /^Date\s+Description/i.test(l))
  if (headerIdx === -1) throw new Error('Unrecognized text format — expected Bank of America statement')

  const rows = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const m = TX_RE.exec(lines[i].trimEnd())
    if (!m) continue
    const [, dateStr, rawDesc, amtStr] = m
    const amount = parseFloat(amtStr.replace(/,/g, ''))
    if (isNaN(amount) || amount === 0) continue
    const isCredit = amount > 0
    rows.push({
      date: mmddyyyy(dateStr),
      merchant: cleanBofADesc(rawDesc),
      description: rawDesc.trim(),
      amount: Math.abs(amount),
      currency: 'USD',
      amount_usd: Math.abs(amount),
      isCredit,
      category: null,
      payment_method: 'BOA Checking',
      source: 'txt_boa',
    })
  }
  if (rows.length === 0) throw new Error('No transactions found in this file')
  return rows
}

function cleanBofADesc(raw) {
  const d = raw.trim()
  if (/^Check \d+/i.test(d)) return d.match(/^Check \d+/i)[0]
  if (/^BKOFAMERICA ATM|^ATM WITHDRWL/i.test(d)) return 'ATM Withdrawal'
  if (/^KEEP THE CHANGE/i.test(d)) return 'Keep the Change'
  const zFrom = d.match(/^Zelle (?:Recurring )?payment from ([^;]+?)\s+for\s+/i)
  if (zFrom) return `Zelle from ${zFrom[1].trim()}`
  const zTo = d.match(/^Zelle (?:Recurring )?payment to ([^;]+?)\s+for\s+/i)
  if (zTo) return `Zelle to ${zTo[1].trim()}`
  const bill = d.match(/^(.*?)\s+Bill Payment/i)
  if (bill) return bill[1].trim()
  const payroll = d.match(/^([\w][^D]+?)\s+DES:PAYROLL/i)
  if (payroll) return payroll[1].trim()
  const retail = d.match(/^(.*?)\s+\d{2}\/\d{2}\s+PURCHASE/i)
  if (retail) return retail[1].replace(/\s+#\S+$/, '').trim()
  return d.split(/\s{2,}/)[0].trim()
}

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
  const h = headers.map(s => s.toLowerCase().trim())
  if (h.includes('transaction date') && h.includes('merchant') && h.includes('purchased by')) return APPLE_CARD
  if (h.includes('transaction date') && h.includes('post date') && h.includes('memo')) return CHASE
  if (h.includes('trans. date') && h.includes('post date')) return DISCOVER
  if (h.includes('posted date') && h.includes('payee') && h.includes('reference number')) return BOA
  if (h.includes('transaction date') && h.includes('posted date') && h.includes('reference number')) return WELLS_FARGO_CC
  if (h.includes('checknumber') && h.some(c => c.includes('withdrawal')) && h.some(c => c.includes('deposit'))) return SCHWAB_INVESTOR
  if (h.some(c => c.includes('withdrawal')) && h.some(c => c.includes('deposit'))) return SCHWAB
  // Wells Fargo checking: 5-col format with asterisk placeholder columns
  if (h.includes('date') && h.includes('amount') && h.includes('description') && headers.some(c => /^\*+\s*$/.test(c))) return WELLS_FARGO
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

const SCHWAB_INVESTOR = {
  name: 'Schwab Investor Checking',
  parse: (row) => {
    const keys = Object.keys(row)
    const withdrawalKey = keys.find(k => k.toLowerCase().includes('withdrawal'))
    const depositKey = keys.find(k => k.toLowerCase().includes('deposit'))
    const dateKey = keys.find(k => k.toLowerCase().includes('date'))
    const withdrawal = parseFloat((row[withdrawalKey] ?? '').replace(/[$,]/g, ''))
    const deposit = parseFloat((row[depositKey] ?? '').replace(/[$,]/g, ''))
    const isCredit = !isNaN(deposit) && deposit > 0
    const amount = isCredit ? deposit : withdrawal
    if (isNaN(amount) || amount <= 0) return null
    return {
      date: mmddyyyy(row[dateKey]),
      merchant: row['Description']?.trim(),
      description: null,
      amount,
      currency: 'USD',
      amount_usd: amount,
      isCredit,
      category: null,
      payment_method: 'Schwab Investor Checking',
      source: 'csv_schwab_investor',
    }
  },
}

// Wells Fargo checking/savings: Date, Amount, *, **, Description (no header row sometimes)
// Amount is negative for debits, positive for credits
const WELLS_FARGO = {
  name: 'Wells Fargo',
  parse: (row) => {
    const amount = parseFloat(row['Amount'])
    if (isNaN(amount) || amount === 0) return null
    const isCredit = amount > 0
    return {
      date: mmddyyyy(row['Date']),
      merchant: cleanWFDesc(row['Description']?.trim()),
      description: row['Description']?.trim() || null,
      amount: Math.abs(amount),
      currency: 'USD',
      amount_usd: Math.abs(amount),
      isCredit,
      category: null,
      payment_method: 'Wells Fargo Checking',
      source: 'csv_wf',
    }
  },
}

// Wells Fargo credit card: Transaction Date, Posted Date, Reference Number, Description, Credits, Charges
const WELLS_FARGO_CC = {
  name: 'Wells Fargo Credit Card',
  parse: (row) => {
    const charges = parseFloat((row['Charges'] ?? '').replace(/[$,]/g, ''))
    const credits = parseFloat((row['Credits'] ?? '').replace(/[$,]/g, ''))
    const isCredit = !isNaN(credits) && credits > 0 && (isNaN(charges) || charges === 0)
    const amount = isCredit ? credits : charges
    if (isNaN(amount) || amount <= 0) return null
    return {
      date: mmddyyyy(row['Transaction Date']),
      merchant: cleanWFDesc(row['Description']?.trim()),
      description: row['Description']?.trim() || null,
      amount,
      currency: 'USD',
      amount_usd: amount,
      isCredit,
      category: null,
      payment_method: 'Wells Fargo Credit Card',
      source: 'csv_wf_cc',
    }
  },
}

function cleanWFDesc(raw) {
  if (!raw) return raw
  // Strip trailing reference numbers like "1234567890 #123456"
  let d = raw.replace(/\s+\d{6,}\s*#?\d*$/, '').trim()
  // Normalize common WF prefixes
  d = d.replace(/^POS PURCHASE\s*/i, '')
  d = d.replace(/^DEBIT PURCHASE-VISA\s*/i, '')
  d = d.replace(/^RECURRING PAYMENT\s*/i, '')
  d = d.replace(/^ONLINE PAYMENT\s*/i, 'Online Payment ')
  // Clean up city/state suffixes: "MERCHANT NAME  SAN FRANCISCO CA"
  d = d.replace(/\s{2,}[A-Z\s]+\s+[A-Z]{2}\s*$/, '').trim()
  return d || raw.trim()
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
