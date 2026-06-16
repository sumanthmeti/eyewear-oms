export function SlaBadge({ status }) {
  const map = {
    on_track:  'bg-green-800 text-green-200',
    at_risk:   'bg-yellow-800 text-yellow-200',
    breached:  'bg-red-800 text-red-200',
    completed: 'bg-slate-700 text-slate-300',
  }
  const label = {
    on_track:  '🟢 On Track',
    at_risk:   '🟡 At Risk',
    breached:  '🔴 Breached',
    completed: '✅ Completed',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${map[status] || 'bg-slate-700'}`}>
      {label[status] || status}
    </span>
  )
}

export function SlaTimer({ hours }) {
  if (hours === null || hours === undefined) return <span className="text-slate-400">—</span>
  if (hours > 0) {
    return <span className={`text-sm font-medium ${hours < 8 ? 'text-yellow-400' : 'text-green-400'}`}>
      {hours}h remaining
    </span>
  }
  return (
    <span className="text-sm font-medium text-red-400">
      {Math.abs(hours)}h overdue
    </span>
  )
}

export function StatusBadge({ status }) {
  const color = {
    'Order Placed':          'bg-slate-700 text-slate-200',
    'Prescription Verified': 'bg-blue-900 text-blue-200',
    'Lens Cutting':          'bg-purple-900 text-purple-200',
    'Coating Applied':       'bg-indigo-900 text-indigo-200',
    'Assembly':              'bg-cyan-900 text-cyan-200',
    'Quality Check':         'bg-orange-900 text-orange-200',
    'QC Failed':             'bg-red-900 text-red-200',
    'Dispatch Ready':        'bg-teal-900 text-teal-200',
    'Dispatched':            'bg-green-900 text-green-200',
    'Delivered':             'bg-slate-600 text-slate-300',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${color[status] || 'bg-slate-700'}`}>
      {status}
    </span>
  )
}
