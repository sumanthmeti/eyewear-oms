import { useState, useEffect } from 'react'
import { checkStock, getBreachPredictions } from '../api'

export function InventoryCheck() {
  const [form, setForm] = useState({
    lens_power: '',
    lens_type: 'Single Vision',
    lens_index: '1.56',
    coating: 'Anti-Reflective',
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const check = async () => {
    if (!form.lens_power) return
    setLoading(true)
    try {
      const data = await checkStock(form)
      setResult(data)
    } catch {
      setResult({ in_stock: false, message: 'Error checking stock' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h2 className="font-semibold text-slate-200 mb-4">🔍 Inventory Check</h2>
      <div className="space-y-3">
        <input
          className="w-full bg-slate-700 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none placeholder-slate-400"
          placeholder="Lens power (e.g. -1.00 or +2.50)"
          value={form.lens_power}
          onChange={e => setForm(f => ({ ...f, lens_power: e.target.value }))}
        />
        <select
          className="w-full bg-slate-700 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none"
          value={form.lens_type}
          onChange={e => setForm(f => ({ ...f, lens_type: e.target.value }))}
        >
          {['Single Vision','Progressive','Bifocal','Blue Cut','Photochromic'].map(t =>
            <option key={t}>{t}</option>)}
        </select>
        <select
          className="w-full bg-slate-700 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none"
          value={form.lens_index}
          onChange={e => setForm(f => ({ ...f, lens_index: e.target.value }))}
        >
          {['1.50','1.56','1.60','1.67','1.74'].map(i => <option key={i}>{i}</option>)}
        </select>
        <select
          className="w-full bg-slate-700 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none"
          value={form.coating}
          onChange={e => setForm(f => ({ ...f, coating: e.target.value }))}
        >
          {['Anti-Reflective','Blue Cut Coating','Photochromic','UV400','None'].map(c =>
            <option key={c}>{c}</option>)}
        </select>
        <button
          onClick={check}
          disabled={loading}
          className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-sm py-2 rounded-lg font-semibold"
        >
          {loading ? 'Checking…' : 'Check Stock'}
        </button>

        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.in_stock ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
            <p className="font-bold">{result.in_stock ? '✅ In Stock' : '❌ Out of Stock'}</p>
            <p className="text-xs mt-1">{result.message}</p>
            {result.quantity > 0 && (
              <p className="text-xs mt-1">Quantity available: {result.quantity}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function PredictionsPanel() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getBreachPredictions()
      setData(res.at_risk_orders)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-200">
          🤖 AI Breach Predictions
          <span className="ml-2 bg-orange-600 text-white text-xs px-2 py-0.5 rounded-full">{data.length} at risk</span>
        </h2>
        <button onClick={load} className="text-slate-400 hover:text-white text-sm">🔄</button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Running predictions…</p>
      ) : data.length === 0 ? (
        <p className="text-green-400 text-sm">✅ No orders at risk of breach</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {data.map(o => {
            const pct = Math.round(o.breach_probability * 100)
            const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-500' : 'bg-yellow-500'
            return (
              <div key={o.order_id} className="bg-slate-700 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-blue-400 text-sm font-semibold">{o.order_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full text-white ${color}`}>
                    {pct}% risk
                  </span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-1.5 mb-2">
                  <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-slate-300 space-y-0.5">
                  <p>{o.customer_name} · {o.store_location}</p>
                  <p>Stage: {o.status}</p>
                  <p>{o.hours_remaining < 0
                    ? `⏰ ${Math.abs(o.hours_remaining)}h overdue`
                    : `⏱ ${o.hours_remaining}h remaining`}
                  </p>
                  {!o.is_in_stock && <p className="text-red-400">❌ Lens out of stock</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
