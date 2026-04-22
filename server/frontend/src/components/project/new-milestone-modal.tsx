import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VoiceInputButton } from '@/components/shared/voice-input-button';
import { useProjectNodes } from '@/lib/queries';

interface NewMilestoneModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  variant: 'new' | 'queue';
  onConfirm: (vision: string, nodeId: string) => void;
}

export function NewMilestoneModal({
  open,
  onOpenChange,
  projectId,
  variant,
  onConfirm,
}: NewMilestoneModalProps) {
  const [vision, setVision] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const { data: nodes = [] } = useProjectNodes(projectId);

  const title = variant === 'new' ? 'New Milestone' : 'Queue Milestone';
  const primaryNodeId = nodes[0]?.id ?? '';
  const effectiveNodeId = nodes.length > 1 ? selectedNodeId : primaryNodeId;

  function reset() {
    setVision('');
    setSelectedNodeId('');
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleConfirm() {
    onConfirm(vision, effectiveNodeId);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Describe the milestone and it will be queued for the next available session.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="vision-textarea">
                Vision
              </label>
              <VoiceInputButton onTranscribed={(text) => setVision((v) => v ? `${v} ${text}` : text)} />
            </div>
            <Textarea
              id="vision-textarea"
              placeholder="Describe the milestone vision…"
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              rows={4}
            />
          </div>

          {nodes.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Node</label>
              <Select
                value={selectedNodeId}
                onValueChange={setSelectedNodeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a node" />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.local_path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!vision.trim()} onClick={handleConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
