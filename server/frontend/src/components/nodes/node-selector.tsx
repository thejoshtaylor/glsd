// GSD Cloud — NodeSelector component
// Dropdown to select a registered node for session creation

import { cn } from '@/lib/utils';
import { useNodes } from '@/lib/queries';

interface NodeSelectorProps {
  value: string | null;
  onChange: (nodeId: string) => void;
  className?: string;
}

export function NodeSelector({ value, onChange, className }: NodeSelectorProps) {
  const { data, isLoading } = useNodes();

  const nodes = data?.data ?? [];

  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value) {
          onChange(e.target.value);
        }
      }}
      disabled={isLoading}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
        'focus:outline-none focus:ring-1 focus:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <option value="" disabled>
        {isLoading
          ? 'Loading nodes...'
          : nodes.length === 0
          ? 'No nodes paired — pair a node first'
          : 'Select a node...'}
      </option>

      {nodes.map((node) => {
        // A node is online when it has connected and not yet disconnected
        const is_online = node.connected_at !== null && node.disconnected_at === null;
        return (
          <option key={node.id} value={node.id}>
            {is_online ? '● ' : '○ '}
            {node.name}
            {is_online ? ' (online)' : ' (offline)'}
          </option>
        );
      })}
    </select>
  );
}
