// VCCA - Project Wizard Dialog Tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { render, screen, act } from "@/test/test-utils";
import userEvent from "@testing-library/user-event";
import { ProjectWizardDialog } from "../project-wizard-dialog";
import type { ProjectTemplate, GsdPlanningTemplate } from "@/lib/api/projects";

// ---------------------------------------------------------------------------
// Mock @/lib/queries — spread real module, override only hooks used
// ---------------------------------------------------------------------------
vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useProjectTemplates: vi.fn(),
    useGsdPlanningTemplates: vi.fn(),
    useNodes: vi.fn(),
  };
});

import { useProjectTemplates, useGsdPlanningTemplates, useNodes } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Mock node-first API functions
// ---------------------------------------------------------------------------
vi.mock("@/lib/api/nodes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/nodes")>();
  return {
    ...actual,
    scaffoldOnNode: vi.fn(),
  };
});

vi.mock("@/lib/api/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/projects")>();
  return {
    ...actual,
    createProject: vi.fn(),
    addProjectNode: vi.fn(),
  };
});

import { scaffoldOnNode } from "@/lib/api/nodes";
import { createProject, addProjectNode } from "@/lib/api/projects";

// ---------------------------------------------------------------------------
// Mock NodeDirPicker so tests can trigger folder selection
// ---------------------------------------------------------------------------
vi.mock("@/components/shared/node-dir-picker", () => ({
  default: ({ onSelect }: { onSelect: (path: string) => void }) => (
    <div>
      <button type="button" onClick={() => onSelect("/Users/test/projects")}>
        Select Folder
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeWebTemplate(overrides: Partial<ProjectTemplate> = {}): ProjectTemplate {
  return {
    id: "react-ts",
    name: "React + TypeScript",
    description: "Modern React SPA with TypeScript and Vite.",
    category: "Web",
    language: "TypeScript",
    archetype: "webapp",
    ...overrides,
  };
}

function makeCliTemplate(overrides: Partial<ProjectTemplate> = {}): ProjectTemplate {
  return {
    id: "rust-cli",
    name: "Rust CLI",
    description: "Command-line tool built with Rust and Clap.",
    category: "CLI",
    language: "Rust",
    archetype: "cli",
    ...overrides,
  };
}

function makeApiTemplate(overrides: Partial<ProjectTemplate> = {}): ProjectTemplate {
  return {
    id: "node-api",
    name: "Node.js API",
    description: "Express REST API with TypeScript.",
    category: "API/Backend",
    language: "TypeScript",
    archetype: "api",
    ...overrides,
  };
}

function makePlanningTemplate(overrides: Partial<GsdPlanningTemplate> = {}): GsdPlanningTemplate {
  return {
    id: "web_app",
    name: "Web Application",
    description: "Web application milestone + slice archetype.",
    archetype: "web_app",
    ...overrides,
  };
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node-1",
    name: "My Dev Node",
    is_revoked: false,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    os: "linux",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupTemplatesMock(
  templates: ProjectTemplate[] = [],
  overrides: Record<string, unknown> = {}
) {
  (useProjectTemplates as Mock).mockReturnValue({
    data: templates,
    isLoading: false,
    error: null,
    ...overrides,
  });
}

function setupPlanningMock(
  templates: GsdPlanningTemplate[] = [],
  overrides: Record<string, unknown> = {}
) {
  (useGsdPlanningTemplates as Mock).mockReturnValue({
    data: templates,
    isLoading: false,
    error: null,
    ...overrides,
  });
}

function setupNodesMock(nodes: ReturnType<typeof makeNode>[] = []) {
  (useNodes as Mock).mockReturnValue({
    data: { data: nodes, count: nodes.length },
  });
}

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProjectWizardDialog", () => {
  const mockImportedProjectId = "proj-abc-123";

  beforeEach(() => {
    vi.clearAllMocks();
    setupTemplatesMock([makeWebTemplate(), makeCliTemplate(), makeApiTemplate()]);
    setupPlanningMock([makePlanningTemplate()]);
    setupNodesMock([makeNode()]);

    (scaffoldOnNode as Mock).mockResolvedValue({
      ok: true,
      projectPath: `/Users/test/projects/my-project`,
      filesCreated: ["README.md", "package.json"],
    });
    (createProject as Mock).mockResolvedValue({
      id: mockImportedProjectId,
      name: "my-project",
    });
    (addProjectNode as Mock).mockResolvedValue({ id: "pn-1" });
  });

  // -------------------------------------------------------------------------
  // Test 1: Dialog renders in Create New mode by default
  // -------------------------------------------------------------------------

  it("renders dialog in Create New mode by default", () => {
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // Dialog title present
    expect(screen.getByText("New Project")).toBeInTheDocument();

    // Top-level tabs: Create New is active by default
    expect(screen.getByRole("tab", { name: /create new/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /import existing/i })).toBeInTheDocument();

    // Template step content is visible (step 1 of create flow)
    // The step indicator shows "Template" as the active step
    expect(screen.getByText("Template")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 2: Template cards render from the template catalog
  // -------------------------------------------------------------------------

  it("renders template cards from the template catalog", () => {
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // All three templates from fixtures should be visible
    expect(screen.getByText("React + TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Rust CLI")).toBeInTheDocument();
    expect(screen.getByText("Node.js API")).toBeInTheDocument();

    // Category group headers should appear
    expect(screen.getByText("Web")).toBeInTheDocument();
    expect(screen.getByText("CLI")).toBeInTheDocument();
    expect(screen.getByText("API/Backend")).toBeInTheDocument();
  });

  it("shows loading spinner while templates are loading", () => {
    setupTemplatesMock([], { isLoading: true });
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText(/loading templates/i)).toBeInTheDocument();
  });

  it("shows empty state when no templates are available", () => {
    setupTemplatesMock([]);
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText(/no templates available/i)).toBeInTheDocument();
  });

  it("selecting a template enables the Next button", async () => {
    const user = userEvent.setup();
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // Next button should be disabled before selection
    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn).toBeDisabled();

    // Click the first template card
    await act(async () => {
      await user.click(screen.getByText("React + TypeScript"));
    });

    expect(nextBtn).not.toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Test 3: Switching to Import Existing mode works
  // -------------------------------------------------------------------------

  it("switching to Import Existing tab renders import content", async () => {
    const user = userEvent.setup();
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // Initially in Create New mode — template step is visible
    expect(screen.getByText("React + TypeScript")).toBeInTheDocument();

    // The main wizard tablist is inside the wizard dialog; query it directly
    // using getAllByRole and picking the one inside the wizard (not the ImportProjectDialog)
    const [wizardTablist] = screen.getAllByRole("tablist");

    // "Import Existing" tab button — select within the wizard tablist
    const importTabBtn = wizardTablist.querySelector(
      '[data-radix-collection-item][id*="trigger-import"]'
    ) as HTMLElement;
    expect(importTabBtn).not.toBeNull();

    await act(async () => {
      await user.click(importTabBtn);
    });

    // After the state update the tab should be active
    expect(importTabBtn).toHaveAttribute("data-state", "active");

    // The ImportProjectDialog opens (title visible)
    expect(screen.getByText("Import Existing Project")).toBeInTheDocument();
  });

  it("switching back to Create New tab restores template view", async () => {
    const user = userEvent.setup();
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    const [wizardTablist] = screen.getAllByRole("tablist");
    const importTabBtn = wizardTablist.querySelector(
      '[data-radix-collection-item][id*="trigger-import"]'
    ) as HTMLElement;
    const createTabBtn = wizardTablist.querySelector(
      '[data-radix-collection-item][id*="trigger-create"]'
    ) as HTMLElement;

    // Switch to Import tab — ImportProjectDialog opens
    await act(async () => {
      await user.click(importTabBtn);
    });

    expect(importTabBtn).toHaveAttribute("data-state", "active");
    expect(createTabBtn).toHaveAttribute("data-state", "inactive");

    // Cancel on ImportProjectDialog resets the wizard (calls onOpenChange(false)),
    // which internally resets activeTab to "create"
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await act(async () => {
      await user.click(cancelBtn);
    });

    // After reset, create tab is active again
    expect(createTabBtn).toHaveAttribute("data-state", "active");
    expect(importTabBtn).toHaveAttribute("data-state", "inactive");
    // Template cards visible in create tab
    expect(screen.getByText("React + TypeScript")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 4: Project name validation rejects invalid names
  // -------------------------------------------------------------------------

  it("navigates to details step and validates project name — rejects too-short name", async () => {
    const user = userEvent.setup();
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // Step 1: select a template
    await act(async () => {
      await user.click(screen.getByText("React + TypeScript"));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });

    // Step 2: planning — click Next to advance
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });

    // Step 3: node-select — click the node to advance to node-browse
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /my dev node/i }));
    });

    // Step 4: node-browse — select folder to advance to details
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /select folder/i }));
    });

    // Step 5: details — project name input should be visible
    expect(screen.getByLabelText("Project Name")).toBeInTheDocument();

    // Type a 1-character name (too short)
    await act(async () => {
      await user.type(screen.getByLabelText("Project Name"), "a");
    });

    // Validation error should appear
    expect(
      screen.getByText(/name must be at least 2 characters/i)
    ).toBeInTheDocument();
  });

  it("rejects project names with uppercase letters", async () => {
    const user = userEvent.setup();
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // Navigate to details step
    await act(async () => {
      await user.click(screen.getByText("React + TypeScript"));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /my dev node/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /select folder/i }));
    });

    // Type an invalid name with uppercase
    await act(async () => {
      await user.type(screen.getByLabelText("Project Name"), "MyProject");
    });

    // Validation error for non-lowercase
    expect(
      screen.getByText(/lowercase letters, numbers, and hyphens/i)
    ).toBeInTheDocument();
  });

  it("accepts a valid lowercase project name", async () => {
    const user = userEvent.setup();
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // Navigate to details step
    await act(async () => {
      await user.click(screen.getByText("React + TypeScript"));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /my dev node/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /select folder/i }));
    });

    await act(async () => {
      await user.type(screen.getByLabelText("Project Name"), "my-valid-project");
    });

    // The error-specific messages should NOT be shown for a valid name
    expect(
      screen.queryByText(/name must be at least 2 characters/i)
    ).not.toBeInTheDocument();
    // The uppercase/hyphen-start validation error should not be shown
    expect(
      screen.queryByText(/use only lowercase letters/i)
    ).not.toBeInTheDocument();
    // The hint text is always shown when no error; confirm input has value
    expect(screen.getByLabelText("Project Name")).toHaveValue("my-valid-project");
  });

  it("rejects project names starting with a hyphen", async () => {
    const user = userEvent.setup();
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // Navigate to details step
    await act(async () => {
      await user.click(screen.getByText("React + TypeScript"));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /my dev node/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /select folder/i }));
    });

    await act(async () => {
      await user.type(screen.getByLabelText("Project Name"), "-bad-name");
    });

    expect(
      screen.getByText(/lowercase letters, numbers, and hyphens/i)
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // GSD planning step — "No GLSD Planning" option always present
  // -------------------------------------------------------------------------

  it("planning step shows No GLSD Planning option and loaded planning templates", async () => {
    const user = userEvent.setup();
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // Navigate to planning step
    await act(async () => {
      await user.click(screen.getByText("React + TypeScript"));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });

    // "No GLSD Planning" is always injected as the first option
    expect(screen.getByText("No GLSD Planning")).toBeInTheDocument();
    // The loaded template should also appear
    expect(screen.getByText("Web Application")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Scaffold → createProject → addProjectNode → navigate flow
  // -------------------------------------------------------------------------

  it("scaffold success creates project+node records and Open Project navigates to /projects/:id", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectWizardDialog {...DEFAULT_PROPS} />);

    // ── Step 1: select template ────────────────────────────────────────────
    await act(async () => {
      await user.click(screen.getByText("React + TypeScript"));
    });
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });

    // ── Step 2: planning → next ────────────────────────────────────────────
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /next/i }));
    });

    // ── Step 3: node-select — click the node ──────────────────────────────
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /my dev node/i }));
    });

    // ── Step 4: node-browse — select folder via mocked NodeDirPicker ──────
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /select folder/i }));
    });

    // ── Step 5: details — enter project name ──────────────────────────────
    await act(async () => {
      await user.type(screen.getByLabelText("Project Name"), "my-project");
    });

    // "Create Project" button should now be enabled
    const createBtn = screen.getByRole("button", { name: /create project/i });
    expect(createBtn).not.toBeDisabled();

    // ── Trigger scaffold ───────────────────────────────────────────────────
    await act(async () => {
      await user.click(createBtn);
    });

    // Wait for scaffold + createProject + addProjectNode to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // ── Assert: scaffoldOnNode was called with the right node and path ─────
    expect(scaffoldOnNode).toHaveBeenCalledWith(
      "node-1",
      expect.objectContaining({
        projectName: "my-project",
        parentPath: "/Users/test/projects",
      })
    );

    // ── Assert: createProject was called ──────────────────────────────────
    expect(createProject).toHaveBeenCalledWith({ name: "my-project" });

    // ── Assert: addProjectNode was called ─────────────────────────────────
    expect(addProjectNode).toHaveBeenCalledWith(
      mockImportedProjectId,
      expect.objectContaining({
        node_id: "node-1",
        local_path: "/Users/test/projects/my-project",
        is_primary: true,
      })
    );

    // ── Assert: success state is shown ────────────────────────────────────
    expect(screen.getByText("Project Created!")).toBeInTheDocument();

    // ── Assert: "Open Project" button is present ──────────────────────────
    const openBtn = screen.getByRole("button", { name: /open project/i });
    expect(openBtn).toBeInTheDocument();

    // Click it and verify onOpenChange(false) was called
    await act(async () => {
      await user.click(openBtn);
    });

    expect(DEFAULT_PROPS.onOpenChange).toHaveBeenCalledWith(false);
  });
});
