// GSD Cloud -- Deploy Node Modal
// Pairing code flow with OS-aware install commands, copy buttons, and live connection indicator.

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Copy, Check, Loader2, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useGeneratePairingCode } from "@/lib/queries";
import * as nodesApi from "@/lib/api/nodes";

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function detectOS(): "macos" | "linux" | "windows" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return "linux";
}

interface DeployNodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeployNodeModal({ open, onOpenChange }: DeployNodeModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [nodeName, setNodeName] = useState("");
  const [code, setCode] = useState("");
  const [isPolling, setIsPolling] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [initialNodeCount, setInitialNodeCount] = useState(0);

  const { copyToClipboard, copiedItems } = useCopyToClipboard({
    showToast: false,
  });

  const generateCode = useGeneratePairingCode();

  const nodesQuery = useQuery({
    queryKey: ["nodes"],
    queryFn: nodesApi.listNodes,
    refetchInterval: isPolling ? 3000 : false,
  });

  // Detect new node connection during polling
  useEffect(() => {
    if (!isPolling || !nodesQuery.data) return;
    if (nodesQuery.data.count > initialNodeCount) {
      setIsPolling(false);
      onOpenChange(false);
      toast.success(`Node '${nodeName}' connected.`);
    }
  }, [isPolling, nodesQuery.data, initialNodeCount, nodeName, onOpenChange]);

  // Code expiry timeout
  useEffect(() => {
    if (!isPolling) return;
    const timer = setTimeout(() => {
      setIsExpired(true);
      setIsPolling(false);
    }, CODE_EXPIRY_MS);
    return () => clearTimeout(timer);
  }, [isPolling]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setStep(1);
      setNodeName("");
      setCode("");
      setIsPolling(false);
      setIsExpired(false);
      setInitialNodeCount(0);
    } else {
      // Stop polling on close (Pitfall 6)
      setIsPolling(false);
    }
  }, [open]);

  const handleGenerate = useCallback(async () => {
    if (!nodeName.trim()) return;
    try {
      const result = await generateCode.mutateAsync(nodeName.trim());
      setCode(result.code);
      // Snapshot node count NOW -- before any new node could pair
      setInitialNodeCount(nodesQuery.data?.count ?? 0);
      setIsPolling(true);
      setStep(2);
    } catch (err) {
      toast.error("Failed to generate pairing code. Please try again.");
    }
  }, [nodeName, generateCode, nodesQuery.data]);

  const handleRegenerate = useCallback(() => {
    setStep(1);
    setCode("");
    setIsExpired(false);
    setIsPolling(false);
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const defaultTab = detectOS();

  const installCommands = [
    { label: "Install", cmd: `curl -fsSL ${origin}/install | sh` },
    { label: "Log in", cmd: `gsd-cloud login ${code}` },
    { label: "Start", cmd: "gsd-cloud start" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Deploy Node
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Enter a name for your new node to generate a pairing code."
              : "Run these commands on the target machine to connect it."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="node-name">Node Name</Label>
              <Input
                id="node-name"
                placeholder="e.g. dev-laptop, prod-server"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleGenerate();
                }}
              />
            </div>
            <Button
              onClick={() => void handleGenerate()}
              disabled={!nodeName.trim() || generateCode.isPending}
              className="w-full"
            >
              {generateCode.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Terminal className="h-4 w-4 mr-1" />
              )}
              Generate Code
            </Button>
          </div>
        )}

        {step === 2 && !isExpired && (
          <div className="space-y-4">
            {/* Large pairing code display */}
            <div className="text-center py-3">
              <p className="text-xs text-muted-foreground mb-1">
                Pairing Code
              </p>
              <p className="text-3xl font-mono font-bold tracking-widest">
                {code}
              </p>
              {isPolling && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for connection...
                </p>
              )}
            </div>

            {/* OS tabs with install commands */}
            <Tabs defaultValue={defaultTab}>
              <TabsList className="w-full">
                <TabsTrigger value="macos" className="flex-1">
                  macOS
                </TabsTrigger>
                <TabsTrigger value="linux" className="flex-1">
                  Linux
                </TabsTrigger>
                <TabsTrigger value="windows" className="flex-1">
                  Windows
                </TabsTrigger>
              </TabsList>

              <TabsContent value="macos">
                <CommandList
                  commands={installCommands}
                  copyToClipboard={copyToClipboard}
                  copiedItems={copiedItems}
                />
              </TabsContent>

              <TabsContent value="linux">
                <CommandList
                  commands={installCommands}
                  copyToClipboard={copyToClipboard}
                  copiedItems={copiedItems}
                />
              </TabsContent>

              <TabsContent value="windows">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Run in WSL2 terminal
                  </p>
                  <CommandList
                    commands={installCommands}
                    copyToClipboard={copyToClipboard}
                    copiedItems={copiedItems}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {step === 2 && isExpired && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Expired -- regenerate
            </p>
            <p className="text-xs text-muted-foreground">
              The pairing code has expired after 10 minutes.
            </p>
            <Button variant="outline" onClick={handleRegenerate}>
              Generate New Code
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CommandList({
  commands,
  copyToClipboard,
  copiedItems,
}: {
  commands: { label: string; cmd: string }[];
  copyToClipboard: (text: string, msg?: string) => Promise<boolean>;
  copiedItems: Map<string, boolean>;
}) {
  return (
    <div className="space-y-2 mt-2">
      {commands.map(({ label, cmd }, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground mb-0.5">
              Step {i + 1} -- {label}
            </p>
            <code className="block text-xs bg-muted px-2.5 py-1.5 rounded font-mono truncate">
              {cmd}
            </code>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 flex-shrink-0"
            onClick={() => void copyToClipboard(cmd)}
            aria-label={`Copy ${label} command`}
          >
            {copiedItems.get(cmd) ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
