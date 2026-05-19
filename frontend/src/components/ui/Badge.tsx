interface BadgeProps { label: string; variant?: 'status' | 'priority' | 'category' }

const statusColors: Record<string, string> = {
  'Open':        'bg-blue-100 text-blue-800',
  'In Progress': 'bg-yellow-100 text-yellow-800',
  'Resolved':    'bg-green-100 text-green-800',
  'Closed':      'bg-gray-100 text-gray-600',
};

const priorityColors: Record<string, string> = {
  'Critical': 'bg-red-100 text-red-800 ring-1 ring-red-300',
  'High':     'bg-orange-100 text-orange-800',
  'Medium':   'bg-yellow-100 text-yellow-800',
  'Low':      'bg-gray-100 text-gray-600',
};

export default function Badge({ label, variant = 'status' }: BadgeProps) {
  const map = variant === 'priority' ? priorityColors : statusColors;
  const cls = map[label] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
