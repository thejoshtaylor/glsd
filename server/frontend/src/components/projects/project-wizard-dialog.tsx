// Project Wizard Dialog
// Multi-step new project creation wizard with template selection

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
  FolderPlus,
} from "lucide-react";
import { useProjectTemplates, useGsdPlanningTemplates } from "@/lib/queries";
import { createProject } from "@/lib/api/projects";
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

type CreateStep = "template" | "planning" | "details" | "creating";

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
  const [projectName, setProjectName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const { data: templates = [], isLoading: templatesLoading } = useProjectTemplates();
  const { data: planningTemplates = [], isLoading: planningLoading } = useGsdPlanningTemplates();

  const resetState = useCallback(() => {
    setActiveTab("create");
    setStep("template");
    setSelectedTemplate(null);
    setSelectedPlanning("none");
    setProjectName("");
    setNameError(null);
    setCreateError(null);
    setIsCreating(false);
    setCreatedProjectId(null);
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

  const handleCreate = useCallback(async () => {
    if (!projectName) return;
    setStep("creating");
    setIsCreating(true);
    setCreateError(null);

    try {
      const project = await createProject({ name: projectName });
      setCreatedProjectId(project.id);
      setIsCreating(false);
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
      setCreateError(msg);
      setIsCreating(false);
      setStep("details");
    }
  }, [projectName, navigate, handleOpenChange]);

  const canAdvanceFromDetails = !nameError && projectName.length >= 2;

  const allPlanningOptions: Array<
    GsdPlanningTemplate | { id: "none"; name: string; description: string; archetype: string }
  > = [
    { id: "none", name: "No GLSD Planning", description: GSD_PLANNING_DESCRIPTIONS.none, archetype: "none" },
    ...planningTemplates,
  ];

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

                  {createError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        {createError}
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
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === "creating" && (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  {isCreating ? (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                      <h3 className="text-lg font-medium">Creating project…</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Setting up{" "}
                        <span className="font-mono font-medium text-foreground">{projectName}</span>
                      </p>
                    </>
                  ) : createdProjectId ? (
                    <>
                      <CheckCircle className="h-10 w-10 text-status-success mb-4" />
                      <h3 className="text-lg font-medium">Project Created!</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className="font-mono font-medium text-foreground">{projectName}</span>{" "}
                        is ready.
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
                  <Button onClick={() => setStep("details")}>
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}

              {step === "details" && (
                <>
                  <Button variant="outline" onClick={() => setStep("planning")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Back
                  </Button>
                  <Button disabled={!canAdvanceFromDetails} onClick={() => void handleCreate()}>
                    Create Project <Sparkles className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}

              {step === "creating" && !isCreating && createdProjectId && (
                <>
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
                  <Button
                    onClick={() => {
                      void navigate(`/projects/${createdProjectId}`);
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
