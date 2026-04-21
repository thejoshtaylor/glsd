// GLSD - Projects Page Tests
// Adapted for slim ProjectPublic model from cloud API

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/test-utils";
import { ProjectsPage } from "./projects";
import type { ProjectPublic } from "@/lib/api/projects";
import * as queries from "@/lib/queries";

// Mock the queries - match what the component actually uses
vi.mock("@/lib/queries", () => ({
  useProjectsWithStats: vi.fn(),
}));

// Mock the dialog and card components to avoid complex rendering
vi.mock("@/components/projects", () => ({
  BlankProjectDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="blank-dialog">Blank Project Dialog</div> : null,
  ProjectWizardDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="import-dialog">Add Project Dialog</div> : null,
  GuidedProjectWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="guided-dialog">Guided Project Dialog</div> : null,
  ProjectCard: ({ project }: { project: ProjectPublic }) => (
    <a href={`/projects/${project.id}`} data-testid={`project-card-${project.id}`}>
      <span data-testid={`project-name-${project.id}`}>{project.name}</span>
    </a>
  ),
}));

// Mock skeleton component
vi.mock("@/components/ui/skeleton", () => ({
  SkeletonProjectItem: () => <div data-testid="skeleton-project">Loading...</div>,
}));

const mockProjects: ProjectPublic[] = [
  {
    id: "1",
    name: "VCCA",
    user_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    name: "Test Project",
    user_id: "user-1",
    created_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "3",
    name: "Another Project",
    user_id: "user-1",
    created_at: "2025-12-01T00:00:00Z",
  },
];

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Projects page with heading", () => {
    vi.mocked(queries.useProjectsWithStats).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.useProjectsWithStats>);

    render(<ProjectsPage />);

    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("shows loading skeletons while data is loading", () => {
    vi.mocked(queries.useProjectsWithStats).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof queries.useProjectsWithStats>);

    render(<ProjectsPage />);

    const skeletons = screen.getAllByTestId("skeleton-project");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("displays empty state when no projects", () => {
    vi.mocked(queries.useProjectsWithStats).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.useProjectsWithStats>);

    render(<ProjectsPage />);

    expect(screen.getByText("No Projects Yet")).toBeInTheDocument();
  });

  it("renders project cards when projects exist", () => {
    vi.mocked(queries.useProjectsWithStats).mockReturnValue({
      data: mockProjects,
      isLoading: false,
    } as ReturnType<typeof queries.useProjectsWithStats>);

    render(<ProjectsPage />);

    expect(screen.getByText("VCCA")).toBeInTheDocument();
    expect(screen.getByText("Test Project")).toBeInTheDocument();
    expect(screen.getByText("Another Project")).toBeInTheDocument();
  });

  it("project cards link to /projects/:id", () => {
    vi.mocked(queries.useProjectsWithStats).mockReturnValue({
      data: mockProjects,
      isLoading: false,
    } as ReturnType<typeof queries.useProjectsWithStats>);

    render(<ProjectsPage />);

    const controlTowerLink = screen.getByTestId("project-card-1");
    expect(controlTowerLink).toHaveAttribute("href", "/projects/1");
  });

  it("renders search input field", () => {
    vi.mocked(queries.useProjectsWithStats).mockReturnValue({
      data: mockProjects,
      isLoading: false,
    } as ReturnType<typeof queries.useProjectsWithStats>);

    render(<ProjectsPage />);

    const searchInput = screen.getByPlaceholderText("Search by name or path...");
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveValue("");
  });

  it("opens blank project dialog when Add Project is clicked", async () => {
    vi.mocked(queries.useProjectsWithStats).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.useProjectsWithStats>);

    const user = userEvent.setup();
    render(<ProjectsPage />);

    const addButtons = screen.getAllByText("Add Project");
    await user.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("blank-dialog")).toBeInTheDocument();
    });
  });

  it("opens blank project dialog from empty state button", async () => {
    vi.mocked(queries.useProjectsWithStats).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof queries.useProjectsWithStats>);

    const user = userEvent.setup();
    render(<ProjectsPage />);

    const addButtons = screen.getAllByText("Add Project");
    // Click the empty-state button (second one if header button also present)
    await user.click(addButtons[addButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByTestId("blank-dialog")).toBeInTheDocument();
    });
  });
});
