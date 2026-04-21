// VCCA - Guided Project Wizard Tests
// Verifies guided create/start flow routes users to guided overview view (node-first)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { act, render, screen, waitFor } from "@/test/test-utils";
import userEvent from "@testing-library/user-event";
import { GuidedProjectWizard } from "../guided-project-wizard";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return {
    ...actual,
    useProjectTemplates: vi.fn(),
    useGsd2Models: vi.fn(),
    useGsd2GeneratePlanPreview: vi.fn(),
    useGsd2HeadlessStart: vi.fn(),
    useGsd2HeadlessStartWithModel: vi.fn(),
    useNodes: vi.fn(),
  };
});

import {
  useGsd2GeneratePlanPreview,
  useGsd2HeadlessStart,
  useGsd2HeadlessStartWithModel,
  useGsd2Models,
  useNodes,
  useProjectTemplates,
} from "@/lib/queries";

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
import type { Gsd2PlanPreview } from "@/lib/api/projects";

vi.mock("@/components/shared/node-dir-picker", () => ({
  default: ({ onSelect }: { onSelect: (path: string) => void }) => (
    <div>
      <button type="button" onClick={() => onSelect("/Users/test/projects")}>
        Select Folder
      </button>
    </div>
  ),
}));

function makePreview(): Gsd2PlanPreview {
  return {
    intent: "Build an internal dashboard for support operations",
    milestone: {
      title: "Guided Milestone",
      summary: "Deliver a guided-mode MVP",
      slices: [
        {
          id: "S01",
          title: "Foundation",
          goal: "Create baseline app skeleton",
          risk: null,
          depends_on: [],
        },
      ],
    },
  };
}

describe("GuidedProjectWizard", () => {
  const mockPreviewMutateAsync = vi.fn();
  const mockHeadlessStartMutateAsync = vi.fn();
  const mockScaffoldOnNode = scaffoldOnNode as Mock;
  const mockCreateProject = createProject as Mock;
  const mockAddProjectNode = addProjectNode as Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    (useProjectTemplates as Mock).mockReturnValue({
      data: [
        {
          id: "react-ts",
          name: "React + TypeScript",
          description: "Modern React SPA with TypeScript and Vite.",
          category: "Web",
          language: "TypeScript",
          archetype: "webapp",
        },
      ],
      isLoading: false,
    });

    (useGsd2Models as Mock).mockReturnValue({ data: [] });

    (useNodes as Mock).mockReturnValue({
      data: {
        data: [
          {
            id: "node-1",
            name: "My Dev Node",
            is_revoked: false,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
            os: "linux",
          },
        ],
        count: 1,
      },
    });

    mockPreviewMutateAsync.mockResolvedValue(makePreview());
    (useGsd2GeneratePlanPreview as Mock).mockReturnValue({
      mutateAsync: mockPreviewMutateAsync,
      isPending: false,
    });

    mockHeadlessStartMutateAsync.mockResolvedValue("session-guided-001");
    (useGsd2HeadlessStart as Mock).mockReturnValue({
      mutateAsync: mockHeadlessStartMutateAsync,
    });

    (useGsd2HeadlessStartWithModel as Mock).mockReturnValue({
      mutateAsync: vi.fn(),
    });

    mockScaffoldOnNode.mockResolvedValue({
      ok: true,
      projectPath: "/Users/test/projects/guided-app",
      filesCreated: ["README.md"],
    });

    mockCreateProject.mockResolvedValue({ id: "proj-guided-001", name: "guided-app" });
    mockAddProjectNode.mockResolvedValue({ id: "pn-1" });
  });

  it("routes to guided overview after starting guided project execution", async () => {
    const user = userEvent.setup();

    render(<GuidedProjectWizard open={true} onOpenChange={vi.fn()} />);

    // Step 1: select template
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /react \+ typescript/i }));
    });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /^next$/i }));
    });

    // Step 2: node-select — click the node
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /my dev node/i }));
    });

    // Step 3: node-browse — select folder via mocked NodeDirPicker
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /select folder/i }));
    });

    // Step 4: intent — fill name + intent
    await act(async () => {
      await user.type(screen.getByLabelText(/project name/i), "guided-app");
    });

    await act(async () => {
      await user.type(
        screen.getByPlaceholderText(/build a saas dashboard/i),
        "Build a support operations dashboard with SLA tracking and role-based access."
      );
    });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /generate plan/i }));
    });

    // Step 5: preview — advance to approve
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /approve \/ adjust/i }));
    });

    // Step 6: approve
    await act(async () => {
      await user.click(
        screen.getByRole("checkbox", {
          name: /i approve this plan preview and want to start execution/i,
        })
      );
    });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /start building/i }));
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/projects/proj-guided-001?view=overview");
    });

    expect(mockNavigate).not.toHaveBeenCalledWith("/projects/proj-guided-001?view=gsd2-headless");
  });
});
