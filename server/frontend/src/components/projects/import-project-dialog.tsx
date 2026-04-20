// VCCA - Import Existing Project Dialog
// Import an existing codebase into GSD

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  FolderInput,
  Terminal,
  FileCode,
  Package,
  Globe,
  Server,
} from "lucide-react";
import { useImportProjectEnhanced } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ImportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (projectId: string) => void;
  /** When true, renders inner content only — no Dialog wrapper. Used when embedded in another dialog. */
  inline?: boolean;
}

type Step = "select" | "configure" | "importing" | "complete" | "error";

interface DetectedProject {
  path: string;
  name: string;
  type: "web" | "api" | "cli" | "library" | "unknown";
  hasPlanning: boolean;
}

const PROJECT_TYPE_INFO = {
  web: { icon: Globe, label: "Web Application", color: "text-blue-500" },
  api: { icon: Server, label: "API / Backend", color: "text-green-500" },
  cli: { icon: Terminal, label: "CLI Tool", color: "text-purple-500" },
  library: { icon: Package, label: "Library / Package", color: "text-orange-500" },
  unknown: { icon: FileCode, label: "Unknown", color: "text-gray-500" },
};

function ImportProjectContent({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: (projectId: string) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("select");
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [detectedProject, setDetectedProject] = useState<DetectedProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);

  const importProject = useImportProjectEnhanced();

  const handleConfirmPath = useCallback(() => {
    const trimmed = pathInput.trim();
    if (!trimmed) {
      setError("Please enter a project path.");
      return;
    }
    setProjectPath(trimmed);
    setError(null);
    const name = trimmed.split("/").filter(Boolean).pop() ?? "project";
    setDetectedProject({ path: trimmed, name, type: "unknown", hasPlanning: false });
    setStep("configure");
  }, [pathInput]);

  const handleImport = useCallback(async () => {
    if (!projectPath) return;
    setStep("importing");
    setError(null);
    try {
      const result = await importProject.mutateAsync({
        path: projectPath,
        autoSyncRoadmap: autoSync,
        ptySessionId: undefined,
        skipConversion: undefined,
      });
      setProjectId(result.project.id);
      setStep("complete");
      onSuccess?.(result.project.id);
      toast.success("Project imported successfully!", {
        action: {
          label: "Open Project",
          onClick: () => void navigate(`/projects/${result.project.id}?view=gsd`),
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setStep("error");
    }
  }, [projectPath, autoSync, importProject, onSuccess, navigate]);

  const handleViewProject = useCallback(() => {
    if (projectId) {
      void navigate(`/projects/${projectId}`);
      onClose();
    }
  }, [projectId, navigate, onClose]);

  const typeInfo = detectedProject
    ? PROJECT_TYPE_INFO[detectedProject.type]
    : PROJECT_TYPE_INFO.unknown;
  const TypeIcon = typeInfo.icon;

  const description = {
    select: "Enter the path to your existing project folder.",
    configure: "Review project details before importing.",
    importing: "Importing project...",
    complete: "Project imported successfully.",
    error: "Failed to import project.",
  }[step];

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FolderInput className="h-5 w-5 text-primary" />
          Import Existing Project
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {step === "select" && (
        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FolderOpen className="h-4 w-4" />
              <span className="text-sm font-medium">Project folder path</span>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="/home/user/my-project"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmPath(); }}
                className="flex-1 font-mono text-sm"
                autoFocus
              />
              <Button onClick={handleConfirmPath} disabled={!pathInput.trim()}>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the absolute path to the project folder on the node.
            </p>
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      )}

      {step === "configure" && detectedProject && (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg bg-muted", typeInfo.color)}>
                <TypeIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{detectedProject.name}</p>
                <p className="text-xs text-muted-foreground truncate">{detectedProject.path}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Existing Configuration</Label>
            <div className="flex gap-4">
              <div className={cn(
                "flex items-center gap-2 text-sm px-3 py-2 rounded-lg border",
                detectedProject.hasPlanning
                  ? "bg-status-success/10 border-status-success/30 text-status-success"
                  : "bg-muted text-muted-foreground"
              )}>
                {detectedProject.hasPlanning ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                GLSD
              </div>
              <div className={cn(
                "flex items-center gap-2 text-sm px-3 py-2 rounded-lg border",
                detectedProject.hasPlanning
                  ? "bg-status-warning/10 border-status-warning/30 text-status-warning"
                  : "bg-muted text-muted-foreground"
              )}>
                {detectedProject.hasPlanning ? <AlertTriangle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                GLSD (.planning/)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoSync"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="rounded border-border"
            />
            <Label htmlFor="autoSync" className="text-sm font-normal">
              Automatically sync roadmap after import
            </Label>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Importing project...</p>
        </div>
      )}

      {step === "complete" && (
        <div className="flex flex-col items-center justify-center py-12">
          <CheckCircle className="h-12 w-12 text-status-success mb-4" />
          <h3 className="text-lg font-medium">Project Imported</h3>
          <p className="text-muted-foreground mt-1 text-center">
            {detectedProject?.name} has been imported successfully.
          </p>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-medium">Import Failed</h3>
          <p className="text-destructive mt-1 text-sm text-center max-w-sm">{error}</p>
        </div>
      )}

      <DialogFooter>
        {step === "select" && (
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        )}
        {step === "configure" && (
          <>
            <Button variant="outline" onClick={() => setStep("select")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={() => void handleImport()} disabled={importProject.isPending}>
              Import Project
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </>
        )}
        {step === "importing" && (
          <Button disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Importing...
          </Button>
        )}
        {step === "complete" && (
          <>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleViewProject}>View Project</Button>
          </>
        )}
        {step === "error" && (
          <>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => setStep("select")}>Try Again</Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

export function ImportProjectDialog({
  open,
  onOpenChange,
  onSuccess,
  inline,
}: ImportProjectDialogProps) {
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  if (inline) {
    return (
      <ImportProjectContent onClose={handleClose} onSuccess={onSuccess} />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ImportProjectContent onClose={handleClose} onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  );
}
