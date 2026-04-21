// VCCA - Project Wizard Dialog
// Multi-step new project creation wizard with template selection (node-first)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  GitBranch,
  FolderPlus,
  Server,
} from "lucide-react";
import { useProjectTemplates, useGsdPlanningTemplates, useNodes } from "@/lib/queries";
import { scaffoldOnNode } from "@/lib/api/nodes";
import type { ScaffoldOnNodeRequest } from "@/lib/api/nodes";
import { createProject, addProjectNode } from "@/lib/api/projects";
import NodeDirPicker from "@/components/shared/node-dir-picker";
import { TemplateGrid } from "./template-grid";
import { ImportProjectDialog } from "./import-project-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ProjectTemplate, GsdPlanningTemplate } from "@/lib/api/projects";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CreateStep = "template" | "planning" | "node-select" | "node-browse" | "details" | "creating";

type TopTab = "create" | "import";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GSD_PLANNING_DESCRIPTIONS: Record<string, string> = {
  none: "Skip GLSD planning setup — add it later if needed.",
  web_app: "Web application milestone + slice archetype with frontend/backend slices.",
  cli: "CLI tool planning with commands, parsing, and release slices.",
  api: "REST/GraphQL API planning with data model, auth, and endpoint slices.",
  library: "Library/package planning with API design, implementation, and publish slices.",
};

const PROJECT_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

function validateProjectName(name: string): string | null {
  if (name.length < 2) return "Name must be at least 2 characters.";
  if (!PROJECT_NAME_REGEX.test(name))
    return "Use only lowercase letters, numbers, and hyphens. Must start with a letter or number.";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface PlanningOptionProps {
  template: GsdPlanningTemplate | { id: "none"; name: string; description: string; archetype: string };
  selected: boolean;
  onSelect: () => void;
}

function PlanningOption({ template, selected, onSelect }: PlanningOptionProps) {
  const desc = GSD_PLANNING_DESCRIPTIONS[template.id] ?? template.description;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border/50 bg-card hover:border-border hover:bg-muted/30"
      )}
    >
      <div
        className={cn(
          "mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
          selected ? "border-primary" : "border-muted-foreground/40"
        )}
      >
        {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{template.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicators
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: { id: CreateStep; label: string }[] = [
  { id: "template", label: "Template" },
  { id: "planning", label: "Planning" },
  { id: "node-select", label: "Node" },
  { id: "node-browse", label: "Folder" },
  { id: "details", label: "Details" },
  { id: "creating", label: "Creating" },
];

function StepIndicator({ current }: { current: CreateStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1">
          <div
            className={cn(
              "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold border",
              i < currentIdx
                ? "bg-primary border-primary text-primary-foreground"
                : i === currentIdx
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground"
            )}
          >
            {i < currentIdx ? <CheckCircle className="h-3 w-3" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-xs hidden sm:inline",
              i === currentIdx ? "text-foreground font-medium" : "text-muted-foreground"
            )}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={cn("h-px w-4 mx-1", i < currentIdx ? "bg-primary" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ProjectWizardDialog({ open, onOpenChange }: ProjectWizardDialogProps) {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TopTab>("create");
  const [step, setStep] = useState<CreateStep>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [selectedPlanning, setSelectedPlanning] = useState<string>("none");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeName, setSelectedNodeName] = useState<string>("");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [projectName, setProjectName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [gitInit, setGitInit] = useState(true);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const [isScaffolding, setIsScaffolding] = useState(false);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);

  const { data: templates = [], isLoading: templatesLoading } = useProjectTemplates();
  const { data: planningTemplates = [], isLoading: planningLoading } = useGsdPlanningTemplates();
  const { data: nodesData } = useNodes();
  const nodes = (nodesData?.data ?? []).filter((n) => !n.is_revoked);

  const resetState = useCallback(() => {
    setActiveTab("create");
    setStep("template");
    setSelectedTemplate(null);
    setSelectedPlanning("none");
    setSelectedNodeId(null);
    setSelectedNodeName("");
    setSelectedPath("");
    setProjectName("");
    setNameError(null);
    setGitInit(true);
    setScaffoldError(null);
    setIsScaffolding(false);
    setImportedProjectId(null);
  }, []);

  const handleOpenChange = useCallback(
    (val: boolean) => {
      if (!val) resetState();
      onOpenChange(val);
    },
    [onOpenChange, resetState]
  );

  const handleNameChange = useCallback((value: string) => {
    setProjectName(value);
    setNameError(value ? validateProjectName(value) : null);
  }, []);

  const handleScaffold = useCallback(async () => {
    if (!selectedTemplate || !projectName || !selectedNodeId || !selectedPath) return;
    setStep("creating");
    setIsScaffolding(true);
    setScaffoldError(null);

    try {
      const req: ScaffoldOnNodeRequest = {
        templateId: selectedTemplate.id,
        projectName,
        parentPath: selectedPath,
        gitInit,
        gsdPlanningTemplate: selectedPlanning !== "none" ? selectedPlanning : undefined,
      };
      const scaffoldResult = await scaffoldOnNode(selectedNodeId, req);

      if (!scaffoldResult.ok) throw new Error(scaffoldResult.error || "Scaffold failed");

      const project = await createProject({ name: projectName });
      await addProjectNode(project.id, {
        node_id: selectedNodeId,
        local_path: scaffoldResult.projectPath,
        is_primary: true,
      });

      setImportedProjectId(project.id);
      setIsScaffolding(false);
      toast.success(`Project "${projectName}" created!`, {
        action: {
          label: "Open",
          onClick: () => {
            void navigate(`/projects/${project.id}`);
            handleOpenChange(false);
          },
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScaffoldError(msg);
      setIsScaffolding(false);
      setStep("details");
    }
  }, [selectedTemplate, projectName, selectedNodeId, selectedPath, gitInit, selectedPlanning, navigate, handleOpenChange]);

  const canAdvanceFromDetails = !nameError && projectName.length >= 2;

  const allPlanningOptions: Array<
    GsdPlanningTemplate | { id: "none"; name: string; description: string; archetype: string }
  > = [
    { id: "none", name: "No GLSD Planning", description: GSD_PLANNING_DESCRIPTIONS.none, archetype: "none" },
    ...planningTemplates,
  ];

  const pathPreview =
    selectedPath && projectName
      ? `${selectedPath.replace(/\/$/, "")}/${projectName}`
      : selectedPath
      ? `${selectedPath}/…`
      : "Select a folder on the node first";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" />
            New Project
          </DialogTitle>
          <DialogDescription>
            Create a new project from a template or import an existing codebase.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TopTab)}
          className="flex flex-col flex-1 min-h-0"
        >
          <TabsList className="w-full">
            <TabsTrigger value="create" className="flex-1">
              <Sparkles className="h-4 w-4 mr-1.5" />
              Create New
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">
              <FolderOpen className="h-4 w-4 mr-1.5" />
              Import Existing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {step !== "creating" && (
              <div className="py-3 flex justify-center border-b border-border/40">
                <StepIndicator current={step} />
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {step === "template" && (
                <div className="p-4">
                  <TemplateGrid
                    templates={templates}
                    selectedId={selectedTemplate?.id}
                    onSelect={setSelectedTemplate}
                    isLoading={templatesLoading}
                  />
                </div>
              )}

              {step === "planning" && (
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-medium mb-1">GLSD Planning Archetype</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Optionally seed your project with a GLSD planning structure.{" "}
                      <span className="text-foreground font-medium">You can always add this later.</span>
                    </p>
                  </div>
                  {planningLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {allPlanningOptions.map((opt) => (
                        <PlanningOption
                          key={opt.id}
                          template={opt}
                          selected={selectedPlanning === opt.id}
                          onSelect={() => setSelectedPlanning(opt.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === "node-select" && (
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-medium mb-1">Select a Node</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Choose which node to scaffold the project on.
                    </p>
                  </div>
                  {nodes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">No connected nodes available.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {nodes.map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => {
                            setSelectedNodeId(node.id);
                            setSelectedNodeName(node.name);
                            setSelectedPath("");
                            setStep("node-browse");
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selectedNodeId === node.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border/50 bg-card hover:border-border hover:bg-muted/30"
                          )}
                        >
                          <Server className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{node.name}</p>
                            {node.os && <p className="text-xs text-muted-foreground">{node.os}</p>}
                          </div>
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full flex-shrink-0",
                              node.connected_at && !node.disconnected_at
                                ? "bg-green-500"
                                : "bg-muted-foreground/30"
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === "node-browse" && selectedNodeId && (
                <div className="p-4">
                  <NodeDirPicker
                    nodeId={selectedNodeId}
                    selectedPath={selectedPath}
                    onSelect={(path) => {
                      setSelectedPath(path);
                      setStep("details");
                    }}
                  />
                </div>
              )}

              {step === "details" && (
                <div className="p-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="projectName">Project Name</Label>
                    <Input
                      id="projectName"
                      value={projectName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="my-awesome-project"
                      autoFocus
                      className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
                    />
                    {nameError ? (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {nameError}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Lowercase letters, numbers, and hyphens only.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Project Path Preview</Label>
                    <div className="rounded-md border px-3 py-2 text-xs font-mono text-muted-foreground bg-muted/30">
                      {pathPreview}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Node: <span className="font-medium text-foreground">{selectedNodeName}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="gitInit"
                      checked={gitInit}
                      onChange={(e) => setGitInit(e.target.checked)}
                      className="rounded border-border"
                    />
                    <Label htmlFor="gitInit" className="text-sm font-normal flex items-center gap-1.5">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      Initialize git repository
                    </Label>
                  </div>

                  {scaffoldError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        {scaffoldError}
                      </p>
                    </div>
                  )}

                  {selectedTemplate && (
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Summary</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" size="sm">{selectedTemplate.name}</Badge>
                        <Badge variant="outline" size="sm">{selectedTemplate.language}</Badge>
                        {selectedPlanning !== "none" && (
                          <Badge variant="outline" size="sm">GSD: {selectedPlanning}</Badge>
                        )}
                        <Badge variant="outline" size="sm">
                          <Server className="h-3 w-3 mr-1" />
                          {selectedNodeName}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === "creating" && (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  {isScaffolding ? (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                      <h3 className="text-lg font-medium">Creating project…</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Scaffolding{" "}
                        <span className="font-mono font-medium text-foreground">{projectName}</span>{" "}
                        on <span className="font-medium text-foreground">{selectedNodeName}</span>
                      </p>
                    </>
                  ) : importedProjectId ? (
                    <>
                      <CheckCircle className="h-10 w-10 text-status-success mb-4" />
                      <h3 className="text-lg font-medium">Project Created!</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="font-mono font-medium text-foreground">{projectName}</span>{" "}
                        is ready on{" "}
                        <span className="font-medium text-foreground">{selectedNodeName}</span>.
                      </p>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-border/40 pt-4 flex-shrink-0">
              {step === "template" && (
                <>
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                  <Button disabled={!selectedTemplate} onClick={() => setStep("planning")}>
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}

              {step === "planning" && (
                <>
                  <Button variant="outline" onClick={() => setStep("template")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Back
                  </Button>
                  <Button onClick={() => setStep("node-select")}>
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}

              {step === "node-select" && (
                <Button variant="outline" onClick={() => setStep("planning")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Back
                </Button>
              )}

              {step === "node-browse" && (
                <Button variant="outline" onClick={() => setStep("node-select")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Back
                </Button>
              )}

              {step === "details" && (
                <>
                  <Button variant="outline" onClick={() => setStep("node-browse")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Back
                  </Button>
                  <Button disabled={!canAdvanceFromDetails} onClick={() => void handleScaffold()}>
                    Create Project <Sparkles className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}

              {step === "creating" && !isScaffolding && importedProjectId && (
                <>
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
                  <Button
                    onClick={() => {
                      void navigate(`/projects/${importedProjectId}`);
                      handleOpenChange(false);
                    }}
                  >
                    Open Project <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
            </DialogFooter>
          </TabsContent>

          <TabsContent value="import" className="flex-1 min-h-0 overflow-y-auto p-1">
            <ImportProjectDialog
              inline
              open={open && activeTab === "import"}
              onOpenChange={(val) => {
                if (!val) handleOpenChange(false);
              }}
              onSuccess={(projectId) => {
                handleOpenChange(false);
                void navigate(`/projects/${projectId}`);
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
