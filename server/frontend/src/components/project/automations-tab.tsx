// VCCA - Automations Tab Component
// Trigger list, chain/action editor, and execution history
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useState } from 'react';
import { Zap, ChevronDown, ChevronRight, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TriggerPublic, ActionChainPublic, ActionPublic } from '@/lib/api/triggers';
import {
  useTriggers,
  useCreateTrigger,
  useUpdateTrigger,
  useDeleteTrigger,
  useTriggerChains,
  useCreateChain,
  useDeleteChain,
  useTriggerActions,
  useCreateAction,
  useDeleteAction,
  useTriggerExecutions,
} from '@/lib/queries';

interface AutomationsTabProps {
  projectId: string;
}

export function AutomationsTab({ projectId }: AutomationsTabProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedTriggers, setExpandedTriggers] = useState<Set<string>>(new Set());

  const { data: triggersData } = useTriggers(projectId);
  const triggers = triggersData?.data ?? [];

  const updateTrigger = useUpdateTrigger();
  const deleteTrigger = useDeleteTrigger();

  const toggleExpand = (id: string) => {
    setExpandedTriggers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Automations</h2>
          <Badge variant="outline">{triggers.length}</Badge>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Trigger
        </Button>
      </div>

      {triggers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>No triggers yet. Create one to automate actions on project events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {triggers.map((trigger) => (
            <TriggerCard
              key={trigger.id}
              trigger={trigger}
              projectId={projectId}
              expanded={expandedTriggers.has(trigger.id)}
              onToggleExpand={() => toggleExpand(trigger.id)}
              onToggleEnabled={(checked) =>
                updateTrigger.mutate({
                  triggerId: trigger.id,
                  data: { enabled: checked },
                  projectId,
                })
              }
              onDelete={() =>
                deleteTrigger.mutate({ triggerId: trigger.id, projectId })
              }
            />
          ))}
        </div>
      )}

      <CreateTriggerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
      />
    </div>
  );
}

interface TriggerCardProps {
  trigger: TriggerPublic;
  projectId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: (checked: boolean) => void;
  onDelete: () => void;
}

function TriggerCard({
  trigger,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onDelete,
}: TriggerCardProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 p-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={onToggleExpand}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{trigger.name}</span>
            <Badge variant="secondary">{trigger.event_type}</Badge>
            {trigger.cooldown_seconds > 0 && (
              <span className="text-xs text-muted-foreground">
                cooldown: {trigger.cooldown_seconds}s
              </span>
            )}
            {trigger.last_fired_at && (
              <span className="text-xs text-muted-foreground">
                last fired: {new Date(trigger.last_fired_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Switch
            checked={trigger.enabled}
            onCheckedChange={onToggleEnabled}
            aria-label={`${trigger.name} enabled`}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onDelete}
            aria-label="Delete trigger"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          <ActionChainEditor triggerId={trigger.id} />
          <ExecutionHistory triggerId={trigger.id} />
        </div>
      )}
    </div>
  );
}

function ActionChainEditor({ triggerId }: { triggerId: string }) {
  const [createChainOpen, setCreateChainOpen] = useState(false);
  const [createActionChainId, setCreateActionChainId] = useState<string | null>(null);

  const { data: chainsData } = useTriggerChains(triggerId);
  const chains = chainsData?.data ?? [];

  const deleteChain = useDeleteChain();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Chains</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateChainOpen(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Chain
        </Button>
      </div>

      {chains.length === 0 ? (
        <p className="text-sm text-muted-foreground">No chains. Add a chain to group actions.</p>
      ) : (
        <div className="space-y-2">
          {chains.map((chain) => (
            <ChainRow
              key={chain.id}
              chain={chain}
              onDelete={() => deleteChain.mutate({ chainId: chain.id, triggerId })}
              onAddAction={() => setCreateActionChainId(chain.id)}
            />
          ))}
        </div>
      )}

      <CreateChainDialog
        open={createChainOpen}
        onOpenChange={setCreateChainOpen}
        triggerId={triggerId}
      />

      {createActionChainId !== null && (
        <CreateActionDialog
          open
          onOpenChange={(open) => { if (!open) setCreateActionChainId(null); }}
          chainId={createActionChainId}
        />
      )}
    </div>
  );
}

interface ChainRowProps {
  chain: ActionChainPublic;
  onDelete: () => void;
  onAddAction: () => void;
}

function ChainRow({ chain, onDelete, onAddAction }: ChainRowProps) {
  const { data: actionsData } = useTriggerActions(chain.id);
  const actions = actionsData?.data ?? [];
  const deleteAction = useDeleteAction();

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{chain.name}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onAddAction}>
            <Plus className="h-3 w-3 mr-1" />
            Add Action
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDelete}
            aria-label="Delete chain"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="space-y-1 pl-2">
          {actions.map((action: ActionPublic) => (
            <div
              key={action.id}
              className="flex items-center justify-between text-sm"
            >
              <Badge variant="outline" className="font-mono text-xs">
                {action.action_type}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => deleteAction.mutate({ actionId: action.id, chainId: chain.id })}
                aria-label="Delete action"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExecutionHistory({ triggerId }: { triggerId: string }) {
  const { data: execData } = useTriggerExecutions(triggerId);
  const executions = execData?.data ?? [];

  const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' => {
    if (status === 'SUCCESS') return 'default';
    if (status === 'PARTIAL') return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-muted-foreground">Execution History</span>

      {executions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No executions yet.</p>
      ) : (
        <div className="space-y-1">
          {executions.map((exec) => (
            <div
              key={exec.id}
              className="flex items-center gap-3 text-sm rounded-md border p-2"
            >
              <Badge variant={statusVariant(exec.status)}>{exec.status}</Badge>
              <span className="text-muted-foreground">
                {new Date(exec.fired_at).toLocaleString()}
              </span>
              {exec.chain_results && Object.keys(exec.chain_results).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(exec.chain_results).map(([key, val]) => (
                    <span key={key} className="text-xs text-muted-foreground">
                      {key}: {val.ok ? 'ok' : (val.error ?? 'error')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CreateTriggerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

function CreateTriggerDialog({ open, onOpenChange, projectId }: CreateTriggerDialogProps) {
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<'taskComplete' | 'taskError'>('taskComplete');
  const [cooldown, setCooldown] = useState(0);

  const createTrigger = useCreateTrigger();

  const handleSubmit = () => {
    createTrigger.mutate(
      {
        projectId,
        data: { name, event_type: eventType, cooldown_seconds: cooldown },
      },
      {
        onSuccess: () => {
          setName('');
          setEventType('taskComplete');
          setCooldown(0);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Trigger</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="trigger-name">Name</Label>
            <Input
              id="trigger-name"
              placeholder="e.g., Notify on task complete"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trigger-event">Event Type</Label>
            <Select
              value={eventType}
              onValueChange={(v) => setEventType(v as 'taskComplete' | 'taskError')}
            >
              <SelectTrigger id="trigger-event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="taskComplete">taskComplete</SelectItem>
                <SelectItem value="taskError">taskError</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trigger-cooldown">Cooldown (seconds)</Label>
            <Input
              id="trigger-cooldown"
              type="number"
              value={cooldown}
              onChange={(e) => setCooldown(Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || createTrigger.isPending}>
            Create Trigger
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CreateChainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerId: string;
}

function CreateChainDialog({ open, onOpenChange, triggerId }: CreateChainDialogProps) {
  const [name, setName] = useState('');
  const createChain = useCreateChain();

  const handleSubmit = () => {
    createChain.mutate(
      { triggerId, data: { name } },
      {
        onSuccess: () => {
          setName('');
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Chain</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="chain-name">Name</Label>
            <Input
              id="chain-name"
              placeholder="e.g., Notifications"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || createChain.isPending}>
            Add Chain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CreateActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chainId: string;
}

function CreateActionDialog({ open, onOpenChange, chainId }: CreateActionDialogProps) {
  const [actionType, setActionType] = useState<ActionPublic['action_type']>('send_notification');
  const [configText, setConfigText] = useState('{}');
  const createAction = useCreateAction();

  const handleSubmit = () => {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(configText) as Record<string, unknown>;
    } catch {
      // fall back to empty config
    }
    createAction.mutate(
      { chainId, data: { action_type: actionType, config } },
      {
        onSuccess: () => {
          setActionType('send_notification');
          setConfigText('{}');
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Action</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="action-type">Action Type</Label>
            <Select
              value={actionType}
              onValueChange={(v) => setActionType(v as ActionPublic['action_type'])}
            >
              <SelectTrigger id="action-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="send_notification">send_notification</SelectItem>
                <SelectItem value="run_bash">run_bash</SelectItem>
                <SelectItem value="run_gsd2_command">run_gsd2_command</SelectItem>
                <SelectItem value="git_push">git_push</SelectItem>
                <SelectItem value="switch_node">switch_node</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="action-config">Config (JSON)</Label>
            <Textarea
              id="action-config"
              placeholder="{}"
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createAction.isPending}>
            Add Action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
