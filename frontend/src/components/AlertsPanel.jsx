import { useState, useEffect } from 'react'
import { getAlerts, resolveAlert } from '../api'

const TYPE_STYLE = {
  SLA_BREACHED:    'border-red-500 bg-red-950',
  SLA_BREACH_RISK: 'border-yellow-500 bg-yellow-950',
  QC_FAILED:       'border-orange-500 bg-orange-950',
  OUT_OF_STOCK:    'border-blue-500 bg-blue-950',
}
const TYPE_ICON = {
  SLA_BREACHED:    '🔴',
  SLA_BREACH_RISK: '🟡',
  QC_FAILED:       '🔧',
  OUT_OF_STOCK:    '📦',
}

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const data = await getAlerts()
    setAlerts(data.alerts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleResolve = async (id) => {
    await resolveAlert(id)
    load()
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-200">
          🔔 Active Alerts
          <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{alerts.length}</span>
        </h2>
        <button onClick={load} className="text-slate-400 hover:text-white text-sm">🔄</button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading alerts…</p>
      ) : alerts.length === 0 ? (
        <p className="text-green-400 text-sm">✅ No active alerts</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {alerts.map(a => (
            <div key={a.id} className={`border-l-4 rounded-r-lg p-3 ${TYPE_STYLE[a.alert_type] || 'border-slate-500 bg-slate-700'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{TYPE_ICON[a.alert_type]}</span>
                    <span className="text-xs font-semibold text-slate-200">{a.alert_type.replace(/_/g,' ')}</span>
                    {a.orders && (
                      <span className="text-xs font-mono text-blue-400">{a.orders.order_number}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300">{a.message}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(a.triggered_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleResolve(a.id)}
                  className="text-xs bg-slate-600 hover:bg-slate-500 px-2 py-1 rounded shrink-0"
                >
                  Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
