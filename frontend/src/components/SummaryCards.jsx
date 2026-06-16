export default function SummaryCards({ summary, alertCount }) {
  const cards = [
    {
      label: 'Total Orders',
      value: summary.total_orders ?? '—',
      color: 'bg-slate-700',
      icon: '📦',
    },
    {
      label: 'Active Orders',
      value: summary.active_orders ?? '—',
      color: 'bg-blue-900',
      icon: '🔄',
    },
    {
      label: 'On Track',
      value: summary.by_sla_status?.on_track ?? 0,
      color: 'bg-green-900',
      icon: '✅',
    },
    {
      label: 'At Risk',
      value: summary.by_sla_status?.at_risk ?? 0,
      color: 'bg-yellow-900',
      icon: '⚠️',
    },
    {
      label: 'Breached',
      value: summary.by_sla_status?.breached ?? 0,
      color: 'bg-red-900',
      icon: '🔴',
    },
    {
      label: 'Active Alerts',
      value: alertCount ?? summary.active_alerts ?? 0,
      color: 'bg-orange-900',
      icon: '🔔',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className={`${c.color} rounded-xl p-4`}>
          <div className="text-2xl mb-1">{c.icon}</div>
          <div className="text-2xl font-bold">{c.value}</div>
          <div className="text-xs text-slate-300 mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  )
}
