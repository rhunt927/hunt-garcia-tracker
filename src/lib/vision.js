const API_KEY = import.meta.env.VITE_VISION_API_KEY
const ENDPOINT = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`

export async function extractReceiptData(imageBase64) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: imageBase64 },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      }],
    }),
  })

  if (!res.ok) throw new Error(`Vision API error: ${res.status}`)
  const data = await res.json()
  const text = data.responses?.[0]?.fullTextAnnotation?.text ?? ''
  return parseReceipt(text)
}

function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  return {
    merchant: extractMerchant(lines),
    date: extractDate(text),
    amount: extractAmount(lines),
    rawText: text,
  }
}

function extractMerchant(lines) {
  // First non-trivial line that doesn't look like a date/amount is usually the merchant
  for (const line of lines.slice(0, 5)) {
    if (line.length < 3) continue
    if (/^\d/.test(line)) continue          // starts with digit (likely date/amount)
    if (/^\$|total|subtotal|tax/i.test(line)) continue
    return line
  }
  return null
}

function extractDate(text) {
  // Try common date patterns: MM/DD/YYYY, MM-DD-YYYY, Month DD YYYY, DD/MM/YYYY
  const patterns = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+(\d{1,2})[\s,]+(\d{4})\b/i,
  ]

  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (!m) continue

    if (pattern.source.includes('Jan|Feb')) {
      // Named month: "June 3 2026"
      const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }
      const month = months[m[1].toLowerCase().slice(0, 3)]
      const day = parseInt(m[2])
      const year = parseInt(m[3])
      return toISO(year, month, day)
    } else {
      let [, a, b, c] = m
      let year = parseInt(c), month = parseInt(a), day = parseInt(b)
      if (year < 100) year += 2000
      // Swap if month > 12 (likely DD/MM)
      if (month > 12) [month, day] = [day, month]
      return toISO(year, month, day)
    }
  }

  return null
}

function toISO(year, month, day) {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function extractAmount(lines) {
  // Look for Total / Grand Total line first, then fall back to largest dollar amount
  const totalLine = lines.find(l => /\btotal\b/i.test(l) && /\d/.test(l))
  if (totalLine) {
    const m = totalLine.match(/\$?\s*([\d,]+\.\d{2})/)
    if (m) return parseFloat(m[1].replace(',', ''))
  }

  // Collect all dollar amounts and return the largest
  const amounts = []
  for (const line of lines) {
    const matches = line.matchAll(/\$?\s*([\d,]+\.\d{2})/g)
    for (const m of matches) {
      const val = parseFloat(m[1].replace(',', ''))
      if (!isNaN(val) && val > 0) amounts.push(val)
    }
  }
  return amounts.length ? Math.max(...amounts) : null
}
