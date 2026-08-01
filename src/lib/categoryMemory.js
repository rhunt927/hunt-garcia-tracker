// Learns merchant → category from past expenses so imports can default to a
// category you've actually used before, instead of always falling back to "Other".

// Statement boilerplate that never identifies the merchant — dropped before matching.
const STOPWORDS = new Set([
  'com', 'www', 'http', 'https', 'bill', 'billpay', 'payment', 'des', 'id', 'indn',
  'co', 'ppd', 'web', 'ref', 'conf', 'tran', 'the', 'inc', 'llc', 'and', 'of',
])

// Bank statement merchant text is noisy (order IDs, ref codes, domains) and that
// noise differs on every transaction even for the same merchant, so a plain string
// match would almost never hit. Strip it down to the stable leading words that
// actually identify the merchant.
export function normalizeMerchantKey(merchant) {
  if (!merchant) return ''
  if (/^check\s*#?\d+$/i.test(merchant.trim())) return '' // a check number alone has no merchant identity

  const tokens = merchant
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // split uniformly on '.', '/', '*', '#', "'", '-', etc.
    .split(/\s+/)
    .filter(tok => {
      if (!tok) return false
      if (STOPWORDS.has(tok)) return false
      if (/^\d+$/.test(tok) && tok.length >= 3) return false // store/ref numbers
      if (/[a-z]/.test(tok) && /\d/.test(tok) && tok.length >= 6) return false // order/confirmation codes
      return true
    })

  return tokens.slice(0, 4).join(' ').trim()
}

// Map of normalized merchant key -> category, but only when the category has
// been consistent across at least `minCount` past transactions. Some merchants
// (marketplaces like Amazon, P2P transfers to a person) legitimately span many
// categories transaction-to-transaction — guessing there would do more harm
// than good, so those are deliberately left unmatched (falls through to the
// existing default instead of a confident-but-wrong guess).
export function buildCategoryMemory(existingExpenses, { minCount = 2, minShare = 1.0 } = {}) {
  const byKey = new Map()
  for (const e of existingExpenses ?? []) {
    if (!e.category || !e.merchant) continue
    const key = normalizeMerchantKey(e.merchant)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, new Map())
    const byCategory = byKey.get(key)
    const stats = byCategory.get(e.category) ?? { count: 0, lastDate: '' }
    stats.count += 1
    if (e.date > stats.lastDate) stats.lastDate = e.date
    byCategory.set(e.category, stats)
  }

  const lookup = new Map()
  for (const [key, byCategory] of byKey) {
    let best = null
    let total = 0
    for (const [category, stats] of byCategory) {
      total += stats.count
      if (!best || stats.count > best.stats.count ||
          (stats.count === best.stats.count && stats.lastDate > best.stats.lastDate)) {
        best = { category, stats }
      }
    }
    if (total >= minCount && best.stats.count / total >= minShare) lookup.set(key, best.category)
  }
  return lookup
}

export function guessCategory(merchant, lookup) {
  const key = normalizeMerchantKey(merchant)
  return key ? lookup.get(key) ?? null : null
}
