import { useState, useEffect } from 'react'
import SummaryCards from './components/SummaryCards'
import OrdersTable from './components/OrdersTable'
import OrderDetail from './components/OrderDetail'
import AlertsPanel from './components/AlertsPanel'
import { InventoryCheck, PredictionsPanel } from './components/Panels'
import { getDashboardSummary, getAlerts } from './api'

const TABS = ['Dashboard', 'Orders', 'Inventory', 'Predictions']

export default function App() {
  const [tab, setTab]             = useState('Dashboard')
  const [summary, setSummary]     = useState({})
  const [alertCount, setAlertCount] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)

  const loadSummary = async () => {
    try {
      const [s, a] = await Promise.all([getDashboardSummary(), getAlerts()])
      setSummary(s)
      setAlertCount(a.total)
    } catch {}
  }

  useEffect(() => {
    loadSummary()
    const interval = setInterval(loadSummary, 30000)   // refresh every 30s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Top navbar */}
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👓</span>
          <span className="font-bold text-white">Eyewear OMS</span>
        </div>

        <div className="flex gap-1 ml-4">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${tab === t
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            >
              {t}
              {t === 'Dashboard' && alertCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {alertCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-slate-500">
          Auto-refreshes every 30s
        </div>
      </nav>

      {/* Content */}
      <main className="p-6 max-w-screen-xl mx-auto">

        {/* ── DASHBOARD TAB ── */}
        {tab === 'Dashboard' && (
          <div className="space-y-6">
            <SummaryCards summary={summary} alertCount={alertCount} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <AlertsPanel />
              </div>
              <div>
                <PredictionsPanel />
              </div>
            </div>
            {/* Quick view: at-risk orders */}
            <div>
              <h2 className="font-semibold text-slate-300 mb-3">⚠️ Orders Needing Attention</h2>
              <OrdersTable
                onSelectOrder={setSelectedOrder}
                defaultFilter={{ sla_status: 'breached' }}
              />
            </div>
          </div>
        )}

        {/* ── ORDERS TAB ── */}
        {tab === 'Orders' && (
          <div>
            <h1 className="text-xl font-bold mb-4">All Orders</h1>
            <OrdersTable onSelectOrder={setSelectedOrder} />
          </div>
        )}

        {/* ── INVENTORY TAB ── */}
        {tab === 'Inventory' && (
          <div>
            <h1 className="text-xl font-bold mb-4">Lens Inventory</h1>
            <div className="max-w-md">
              <InventoryCheck />
            </div>
          </div>
        )}

        {/* ── PREDICTIONS TAB ── */}
        {tab === 'Predictions' && (
          <div>
            <h1 className="text-xl font-bold mb-2">TAT Breach Predictions</h1>
            <p className="text-slate-400 text-sm mb-4">
              AI scores every active order's breach probability based on current stage,
              time remaining, lens type, and stock status.
            </p>
            <div className="max-w-xl">
              <PredictionsPanel />
            </div>
          </div>
        )}
      </main>

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdated={() => { loadSummary(); setSelectedOrder(null) }}
        />
      )}
    </div>
  )
}
