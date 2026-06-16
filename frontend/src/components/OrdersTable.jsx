import { useState, useEffect } from 'react'
import { getOrders } from '../api'
import { SlaBadge, SlaTimer, StatusBadge } from './Badges'

const STATUSES = [
  'Order Placed','Prescription Verified','Lens Cutting',
  'Coating Applied','Assembly','Quality Check',
  'QC Failed','Dispatch Ready','Dispatched','Delivered'
]
const LENS_TYPES = ['Single Vision','Progressive','Bifocal','Blue Cut','Photochromic']
const STORES = ['Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Kolkata']

export default function OrdersTable({ onSelectOrder }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', lens_type: '', store_location: '', sla_status: '' })

  const load = async () => {
    setLoading(true)
    try {
      const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      const data = await getOrders(active)
      setOrders(data.orders)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filters])

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val }))

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          className="bg-slate-700 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none"
          value={filters.status}
          onChange={e => setFilter('status', e.target.value)}
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>

        <select
          className="bg-slate-700 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none"
          value={filters.lens_type}
          onChange={e => setFilter('lens_type', e.target.value)}
        >
          <option value="">All Lens Types</option>
          {LENS_TYPES.map(l => <option key={l}>{l}</option>)}
        </select>

        <select
          className="bg-slate-700 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none"
          value={filters.store_location}
          onChange={e => setFilter('store_location', e.target.value)}
        >
          <option value="">All Stores</option>
          {STORES.map(s => <option key={s}>{s}</option>)}
        </select>

        <select
          className="bg-slate-700 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none"
          value={filters.sla_status}
          onChange={e => setFilter('sla_status', e.target.value)}
        >
          <option value="">All SLA States</option>
          <option value="on_track">🟢 On Track</option>
          <option value="at_risk">🟡 At Risk</option>
          <option value="breached">🔴 Breached</option>
          <option value="completed">✅ Completed</option>
        </select>

        <button
          onClick={load}
          className="bg-blue-700 hover:bg-blue-600 text-sm px-4 py-2 rounded-lg"
        >
          🔄 Refresh
        </button>

        <span className="ml-auto text-slate-400 text-sm self-center">
          {orders.length} orders
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-10 text-slate-400">Loading orders…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left py-2 px-3">Order</th>
                <th className="text-left py-2 px-3">Customer</th>
                <th className="text-left py-2 px-3">Store</th>
                <th className="text-left py-2 px-3">Lens Type</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">SLA</th>
                <th className="text-left py-2 px-3">Time</th>
                <th className="text-left py-2 px-3">Stock</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr
                  key={o.id}
                  onClick={() => onSelectOrder(o)}
                  className="border-b border-slate-700 hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-3 font-mono font-semibold text-blue-400">{o.order_number}</td>
                  <td className="py-3 px-3">{o.customer_name}</td>
                  <td className="py-3 px-3 text-slate-300">{o.store_location}</td>
                  <td className="py-3 px-3 text-slate-300">{o.lens_type}</td>
                  <td className="py-3 px-3"><StatusBadge status={o.status} /></td>
                  <td className="py-3 px-3"><SlaBadge status={o.sla_status} /></td>
                  <td className="py-3 px-3"><SlaTimer hours={o.hours_remaining} /></td>
                  <td className="py-3 px-3">
                    {o.is_in_stock
                      ? <span className="text-green-400 text-xs">✅ In Stock</span>
                      : <span className="text-red-400 text-xs">❌ Out of Stock</span>}
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
