import { useState, useEffect } from 'react'
import { getOrder, updateStatus } from '../api'
import { StatusBadge, SlaBadge, SlaTimer } from './Badges'

const STATUSES = [
  'Order Placed','Prescription Verified','Lens Cutting',
  'Coating Applied','Assembly','Quality Check',
  'QC Failed','Dispatch Ready','Dispatched','Delivered'
]

export default function OrderDetail({ order: initial, onClose, onUpdated }) {
  const [order, setOrder]   = useState(null)
  const [log, setLog]       = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]     = useState({ new_status: '', changed_by: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')

  const load = async () => {
    setLoading(true)
    const data = await getOrder(initial.id)
    setOrder(data.order)
    setLog(data.status_log)
    setForm(f => ({ ...f, new_status: data.order.status }))
    setLoading(false)
  }

  useEffect(() => { load() }, [initial.id])

  const handleUpdate = async () => {
    if (!form.changed_by) return setMsg('Please enter your name.')
    if (form.new_status === order.status) return setMsg('Status is already ' + order.status)
    setSaving(true)
    setMsg('')
    try {
      await updateStatus(order.id, form)
      setMsg('✅ Status updated successfully')
      await load()
      onUpdated()
    } catch {
      setMsg('❌ Update failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-8 text-slate-300">Loading order…</div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <span className="font-mono font-bold text-blue-400 text-lg">{order.order_number}</span>
            <span className="ml-3 text-slate-300">{order.customer_name}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Store" value={order.store_location} />
            <Info label="Source" value={order.source} />
            <Info label="Lens Type" value={order.lens_type} />
            <Info label="Lens Index" value={order.lens_index} />
            <Info label="Coating" value={order.coating} />
            <Info label="Frame" value={order.frame} />
            <Info label="SLA" value={`${order.sla_hours} hours`} />
            <div>
              <p className="text-slate-400 text-xs mb-1">Time Remaining</p>
              <SlaTimer hours={order.hours_remaining} />
            </div>
          </div>

          {/* Prescription */}
          <div className="bg-slate-700 rounded-lg p-3 text-sm">
            <p className="text-slate-400 text-xs mb-2 font-semibold uppercase">Prescription</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-slate-400 text-xs">Right Eye</p>
                <p>SPH {order.rx_sph_r} / CYL {order.rx_cyl_r} / AXIS {order.rx_axis_r}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Left Eye</p>
                <p>SPH {order.rx_sph_l} / CYL {order.rx_cyl_l} / AXIS {order.rx_axis_l}</p>
              </div>
            </div>
          </div>

          {/* Current status */}
          <div className="flex items-center gap-3">
            <StatusBadge status={order.status} />
            <SlaBadge status={order.sla_status} />
            {!order.is_in_stock && <span className="text-xs bg-red-900 text-red-200 px-2 py-1 rounded-full">❌ Out of Stock</span>}
          </div>

          {/* Update Status Form */}
          <div className="bg-slate-700 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-200">Update Status</p>
            <select
              className="w-full bg-slate-600 text-sm rounded-lg px-3 py-2 border border-slate-500 focus:outline-none"
              value={form.new_status}
              onChange={e => setForm(f => ({ ...f, new_status: e.target.value }))}
            >
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input
              className="w-full bg-slate-600 text-sm rounded-lg px-3 py-2 border border-slate-500 focus:outline-none placeholder-slate-400"
              placeholder="Your name *"
              value={form.changed_by}
              onChange={e => setForm(f => ({ ...f, changed_by: e.target.value }))}
            />
            <textarea
              className="w-full bg-slate-600 text-sm rounded-lg px-3 py-2 border border-slate-500 focus:outline-none placeholder-slate-400 resize-none"
              placeholder="Reason for change (required for QC Failed / delays)"
              rows={2}
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            />
            {msg && <p className="text-sm">{msg}</p>}
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm px-4 py-2 rounded-lg w-full font-semibold"
            >
              {saving ? 'Updating…' : 'Update Status'}
            </button>
          </div>

          {/* Status Log */}
          <div>
            <p className="text-sm font-semibold text-slate-300 mb-3">Status History</p>
            <div className="space-y-2">
              {log.map((l, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5" />
                    {i < log.length - 1 && <div className="w-px flex-1 bg-slate-600 mt-1" />}
                  </div>
                  <div className="pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{l.new_status}</span>
                      {l.old_status && <span className="text-slate-400 text-xs">← {l.old_status}</span>}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      {l.changed_by} · {new Date(l.changed_at).toLocaleString()}
                    </div>
                    {l.reason && <div className="text-yellow-300 text-xs mt-0.5">"{l.reason}"</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="text-slate-200">{value || '—'}</p>
    </div>
  )
}
