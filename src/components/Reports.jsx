import { useState, useMemo } from 'react'
import { ChevronLeft, Download, BarChart2, PieChart as PieIcon } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'

const COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

export function Reports({ expenses, transactionTypes, categories, onBack }) {
  const today = new Date()
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfMonth(today), 'yyyy-MM-dd'))
  const [groupBy, setGroupBy] = useState('category') // 'category' | 'type'
  const [chartType, setChartType] = useState('pie') // 'bar' | 'pie'

  const incomeTypeNames = new Set((transactionTypes ?? []).filter(t => t.is_income).map(t => t.name))

  const filtered = useMemo(() => {
    const from = parseISO(dateFrom)
    const to = parseISO(dateTo)
    return expenses.filter(e => {
      try {
        return isWithinInterval(parseISO(e.date), { start: from, end: to })
      } catch { return false }
    })
  }, [expenses, dateFrom, dateTo])

  const totalIncome = filtered.filter(e => incomeTypeNames.has(e.type)).reduce((s, e) => s + (e.amount_usd ?? 0), 0)
  const totalExpenses = filtered.filter(e => !incomeTypeNames.has(e.type)).reduce((s, e) => s + (e.amount_usd ?? 0), 0)
  const net = totalIncome - totalExpenses

  // Monthly bar chart data
  const chartData = useMemo(() => {
    const months = {}
    filtered.forEach(e => {
      try {
        const month = format(startOfMonth(parseISO(e.date)), 'yyyy-MM')
        if (!months[month]) months[month] = {}
        const key = groupBy === 'category' ? (e.category || 'Other') : (e.type || 'Expense')
        months[month][key] = (months[month][key] ?? 0) + (e.amount_usd ?? 0)
      } catch {}
    })
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({
        month: format(parseISO(month + '-01'), 'MMM yyyy'),
        ...values,
      }))
  }, [filtered, groupBy])

  const keys = useMemo(() => {
    const all = new Set()
    chartData.forEach(row => Object.keys(row).filter(k => k !== 'month').forEach(k => all.add(k)))
    return [...all]
  }, [chartData])

  // Pie chart data — total per group key across the date range
  const pieData = useMemo(() => {
    const map = {}
    filtered.forEach(e => {
      const key = groupBy === 'category' ? (e.category || 'Other') : (e.type || 'Expense')
      map[key] = (map[key] ?? 0) + (e.amount_usd ?? 0)
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
  }, [filtered, groupBy])

  // Category breakdown table
  const breakdown = useMemo(() => {
    const map = {}
    filtered.forEach(e => {
      const key = e.category || 'Other'
      if (!map[key]) map[key] = { income: 0, expenses: 0 }
      if (incomeTypeNames.has(e.type)) map[key].income += e.amount_usd ?? 0
      else map[key].expenses += e.amount_usd ?? 0
    })
    return Object.entries(map)
      .map(([cat, { income, expenses }]) => ({ cat, income, expenses, net: income - expenses }))
      .sort((a, b) => b.expenses - a.expenses)
  }, [filtered, incomeTypeNames])

  function exportCSV() {
    const headers = ['Date', 'Merchant', 'Description', 'Amount USD', 'Currency', 'Amount', 'Category', 'Payment Method', 'Type', 'Notes']
    const rows = filtered.map(e => [
      e.date, e.merchant ?? '', e.description ?? '',
      e.amount_usd?.toFixed(2) ?? '', e.currency ?? 'USD',
      e.amount?.toFixed(2) ?? '', e.category ?? '', e.payment_method ?? '',
      e.type ?? '', e.notes ?? '',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses_${dateFrom}_to_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={16} /> Dashboard
        </button>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Date range + group by */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-gray-900/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-gray-900/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Group by</label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
            className="bg-gray-900/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
            <option value="category">Category</option>
            <option value="type">Type</option>
          </select>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-900/30 border border-green-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-green-400 mb-1">Income</p>
          <p className="text-lg font-bold text-white">${totalIncome.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-red-400 mb-1">Expenses</p>
          <p className="text-lg font-bold text-white">${totalExpenses.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Net</p>
          <p className={`text-lg font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {net >= 0 ? '+' : ''}${net.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Chart toggle + chart */}
      <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-300">
            {chartType === 'bar' ? `Monthly by ${groupBy}` : `Total by ${groupBy}`}
          </h3>
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setChartType('bar')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${chartType === 'bar' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <BarChart2 size={13} /> Bar
            </button>
            <button
              onClick={() => setChartType('pie')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${chartType === 'pie' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <PieIcon size={13} /> Pie
            </button>
          </div>
        </div>

        {chartData.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-10">No transactions in this date range.</p>
        ) : chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#f3f4f6' }}
                formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((key, i) => (
                <Bar key={key} dataKey={key} stackId="a" fill={COLORS[i % COLORS.length]}
                  radius={i === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#6b7280' }}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`]}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Category breakdown table */}
      {breakdown.length > 0 && (
        <div className="bg-gray-900/80 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 font-normal">Category</th>
                <th className="px-4 py-3 text-right text-green-400 font-normal">Income</th>
                <th className="px-4 py-3 text-right text-red-400 font-normal">Expenses</th>
                <th className="px-4 py-3 text-right text-gray-400 font-normal">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {breakdown.map(({ cat, income, expenses, net }) => (
                <tr key={cat} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-white">{cat}</td>
                  <td className="px-4 py-2.5 text-right text-green-400">{income > 0 ? `$${income.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-red-400">{expenses > 0 ? `$${expenses.toFixed(2)}` : '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {net >= 0 ? '+' : ''}${net.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
