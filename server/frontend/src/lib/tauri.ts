// GSD Cloud — Tauri stub layer (D-02)
// All Tauri IPC calls are stubbed. Functions return safe empty values.
// Replace imports incrementally with lib/api/* modules in subsequent plans.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

// Stub: UnlistenFn type kept for compatibility with function signatures
export type UnlistenFn = () => void;

// Types
export interface Project {
  id: string;
  name: string;
  path: string;
  description: string | null;
  tech_stack: TechStack | null;
  config: Record<string, unknown> | null;
  status: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  gsd_version: string | null;
}

export interface RoadmapProgress {
  total_phases: number;
  completed_phases: number;
  total_tasks: number;
  completed_tasks: number;
  status: string;
}

export interface ProjectWithStats {
  id: string;
  name: string;
  path: string;
  description: string | null;
  tech_stack: TechStack | null;
  config: Record<string, unknown> | null;
  status: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  total_cost: number;
  roadmap_progress: RoadmapProgress | null;
  last_activity_at: string | null;
  gsd_version: string | null;
}

export interface Gsd2Health {
  budget_spent: number;
  budget_ceiling: number | null;
  active_milestone_id: string | null;
  active_milestone_title: string | null;
  active_slice_id: string | null;
  active_slice_title: string | null;
  active_task_id: string | null;
  active_task_title: string | null;
  phase: string | null;
  blocker: string | null;
  next_action: string | null;
  milestones_done: number;
  milestones_total: number;
  slices_done: number;
  slices_total: number;
  tasks_done: number;
  tasks_total: number;
  env_error_count: number;
  env_warning_count: number;
}

export interface GitInfo {
  branch: string | null;
  is_dirty: boolean;
  has_git: boolean;
}

export interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitStatusDetail {
  has_git: boolean;
  branch: string | null;
  is_dirty: boolean;
  staged_count: number;
  unstaged_count: number;
  untracked_count: number;
  ahead: number;
  behind: number;
  last_commit: GitCommitInfo | null;
  stash_count: number;
}

export interface GitChangedFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
}

export interface GitLogEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
  files_changed: number;
  insertions: number;
  deletions: number;
}

// GitHub integration types
export interface GitHubTokenStatus {
  configured: boolean;
}

export interface GitHubLabel {
  id: number | null;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubUser {
  login: string;
  avatar_url: string | null;
  html_url: string;
}

export interface GitHubRepoInfo {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  open_issues_count: number;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
  clone_url: string;
  pushed_at: string | null;
  visibility: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  user_login: string;
  user_avatar_url: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  head_ref: string;
  base_ref: string;
  draft: boolean;
  mergeable: boolean | null;
  review_decision: string | null;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  comments: number;
  review_comments: number;
}

export interface GitHubReview {
  id: number;
  user_login: string;
  state: string;
  body: string | null;
  submitted_at: string | null;
  html_url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  user_login: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  comments: number;
  milestone_title: string | null;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  app_name: string;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  html_url: string;
  tarball_url: string;
  zipball_url: string;
  assets_count: number;
}

export interface GitHubNotification {
  id: string;
  reason: string;
  unread: boolean;
  title: string;
  type_: string;
  updated_at: string;
  html_url: string | null;
}

export interface TechStack {
  framework: string | null;
  language: string | null;
  package_manager: string | null;
  database: string | null;
  test_framework: string | null;
  has_planning: boolean;
  gsd_phase_count: number | null;
  gsd_todo_count: number | null;
  gsd_has_requirements: boolean;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  status?: string;
}

export interface ActivityEntry {
  id: string;
  project_id: string;
  execution_id: string | null;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Knowledge File System Types (Phase E - KN-01, KN-02)
export interface KnowledgeFileTree {
  folders: KnowledgeFolder[];
  total_files: number;
}

export interface KnowledgeFolder {
  name: string;
  display_name: string;
  files: KnowledgeFileEntry[];
}

export interface KnowledgeFileEntry {
  relative_path: string;
  display_name: string;
  folder: string;
  size_bytes: number;
}

export interface KnowledgeSearchMatch {
  file_path: string;
  display_name: string;
  line_number: number;
  line_content: string;
  context_before: string;
  context_after: string;
}

export interface Settings {
  theme: string;
  start_on_login: boolean;
  default_cost_limit: number;
  notifications_enabled: boolean;
  notify_on_complete: boolean;
  notify_on_error: boolean;
  notify_cost_threshold: number | null;
  // Theme customization (stored in DB)
  accent_color: string;
  ui_density: string;
  font_size_scale: string;
  font_family: string;
  // Startup behavior
  auto_open_last_project: boolean;
  window_state: string;
  // Notification granularity
  notify_on_phase_complete: boolean;
  notify_on_cost_warning: boolean;
  // Advanced
  debug_logging: boolean;
  // Terminal persistence
  use_tmux: boolean;
  user_mode: string;
}

// First-launch onboarding
export type OnboardingUserMode = "guided" | "expert";
export type OnboardingProvider = "anthropic" | "openai" | "github" | "openrouter";

export interface OnboardingStatus {
  completed: boolean;
  completed_at: string | null;
  user_mode: OnboardingUserMode;
  has_api_keys: boolean;
}

export interface DependencyCheck {
  name: string;
  installed: boolean;
  version: string | null;
  message: string | null;
}

export interface DependencyDetectionResult {
  checked_at: string;
  dependencies: DependencyCheck[];
}

export interface ApiKeyValidationResult {
  provider: string;
  key_name: string;
  valid: boolean;
  stored: boolean;
  message: string;
}

export interface ProjectDocs {
  description: string | null;
  goal: string | null;
  source: string;
}

// Markdown Scanning Types
export interface MarkdownScanResult {
  total_files: number;
  total_size_bytes: number;
  folders: MarkdownFolderSummary[];
}

export interface MarkdownFolderSummary {
  relative_path: string;
  display_name: string;
  file_count: number;
}

export interface MarkdownIndexProgress {
  project_id: string;
  indexed: number;
  total: number;
  current_file: string;
}

interface ImportResult {
  project: Project;
  docs: ProjectDocs | null;
  /** PTY session ID if a conversion/generation process was started */
  pty_session_id: string | null;
  /** Import mode: "existing" (has .planning), "gsd" (converting from .planning), "bare" (generating new) */
  import_mode: string;
  /** Markdown scan results from recursive discovery during import */
  markdown_scan: MarkdownScanResult | null;
}

interface CreateProjectResult {
  project: Project;
  pty_session_id: string;
  template: string | null;
  discovery_mode: string;
  creation_mode: string;
}

// PTY Types
export interface CreatePtyOptions {
  workingDirectory: string;
  command?: string;
  cols: number;
  rows: number;
  sessionName?: string;
}

export interface CreatePtyResult {
  sessionId: string;
  tmuxName: string | null;
}

export interface TmuxSessionInfo {
  name: string;
  working_directory: string;
  created_at: string;
}

export interface PtyOutputEvent {
  session_id: string;
  data: number[];
}

export interface PtyExitEvent {
  session_id: string;
  exit_code: number | null;
}

// Global Search Types
export interface GlobalSearchResults {
  projects: ProjectSearchResult[];
  phases: PhaseSearchResult[];
  decisions: DecisionSearchResult[];
  knowledge: KnowledgeSearchResultItem[];
}

export interface ProjectSearchResult {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

export interface PhaseSearchResult {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  project_id: string;
  project_name: string;
}

export interface DecisionSearchResult {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  project_id: string;
  project_name: string;
}

export interface KnowledgeSearchResultItem {
  id: string;
  title: string;
  category: string;
  project_id: string;
  project_name: string;
}

// Project Scanner types
export interface ScannerCategory {
  name: string;
  grade: string;
  summary: string;
  score: number | null;
  issues: number | null;
  priority: string | null;
  status: string | null;
}

export interface ScannerReport {
  name: string;
  relative_path: string;
  description: string;
}

export interface ScannerSummary {
  available: boolean;
  overall_grade: string | null;
  scan_date: string | null;
  categories: ScannerCategory[];
  reports: ScannerReport[];
  total_gaps: number | null;
  total_recommendations: number | null;
  overall_score: number | null;
  analysis_mode: string | null;
  project_phase: string | null;
  high_priority_actions: string[];
  source: string | null;
}

// API Functions — all are console.warn stubs (D-02)
// Replace incrementally with lib/api/* imports as plans execute.

// Projects
export const listProjects = (): Promise<Project[]> => { console.warn('[tauri-stub] listProjects called — no server equivalent'); return Promise.resolve([]); };
export const getProject = (_id: string): Promise<Project> => { console.warn('[tauri-stub] getProject called — no server equivalent'); return Promise.resolve(null as unknown as Project); };
export const importProject = (_path: string): Promise<Project> => { console.warn('[tauri-stub] importProject called — no server equivalent'); return Promise.resolve(null as unknown as Project); };
export const updateProject = (_id: string, _updates: ProjectUpdate): Promise<Project> => { console.warn('[tauri-stub] updateProject called — no server equivalent'); return Promise.resolve(null as unknown as Project); };
export const deleteProject = (_id: string): Promise<void> => { console.warn('[tauri-stub] deleteProject called — no server equivalent'); return Promise.resolve(); };
export const getProjectsWithStats = (): Promise<ProjectWithStats[]> => { console.warn('[tauri-stub] getProjectsWithStats called — no server equivalent'); return Promise.resolve([]); };
export const getGitInfo = (_path: string): Promise<GitInfo> => { console.warn('[tauri-stub] getGitInfo called — no server equivalent'); return Promise.resolve({ branch: null, is_dirty: false, has_git: false }); };
export const getGitStatus = (_projectPath: string): Promise<GitStatusDetail> => { console.warn('[tauri-stub] getGitStatus called — no server equivalent'); return Promise.resolve({ has_git: false, branch: null, is_dirty: false, staged_count: 0, unstaged_count: 0, untracked_count: 0, ahead: 0, behind: 0, last_commit: null, stash_count: 0 }); };
export const gitPush = (_projectPath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitPush called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const gitPull = (_projectPath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitPull called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const gitFetch = (_projectPath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitFetch called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const gitStageAll = (_projectPath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitStageAll called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const gitCommit = (_projectPath: string, _message: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitCommit called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const gitStashSave = (_projectPath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitStashSave called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const gitStashPop = (_projectPath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitStashPop called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const getGitChangedFiles = (_projectPath: string): Promise<GitChangedFile[]> => { console.warn('[tauri-stub] getGitChangedFiles called — no server equivalent'); return Promise.resolve([]); };
export const getGitLog = (_projectPath: string, _limit?: number): Promise<GitLogEntry[]> => { console.warn('[tauri-stub] getGitLog called — no server equivalent'); return Promise.resolve([]); };
export const gitStageFile = (_projectPath: string, _filePath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitStageFile called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const gitUnstageFile = (_projectPath: string, _filePath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitUnstageFile called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const gitDiscardFile = (_projectPath: string, _filePath: string): Promise<GitOperationResult> => { console.warn('[tauri-stub] gitDiscardFile called — no server equivalent'); return Promise.resolve({ success: false, message: 'Not available in web' }); };
export const getGitRemoteUrl = (_projectPath: string): Promise<string> => { console.warn('[tauri-stub] getGitRemoteUrl called — no server equivalent'); return Promise.resolve(''); };
export const getGitBranches = (_projectPath: string): Promise<string[]> => { console.warn('[tauri-stub] getGitBranches called — no server equivalent'); return Promise.resolve([]); };
export const getGitTags = (_projectPath: string): Promise<string[]> => { console.warn('[tauri-stub] getGitTags called — no server equivalent'); return Promise.resolve([]); };
export const getScannerSummary = (_path: string): Promise<ScannerSummary> => { console.warn('[tauri-stub] getScannerSummary called — no server equivalent'); return Promise.resolve({ available: false, overall_grade: null, scan_date: null, categories: [], reports: [], total_gaps: null, total_recommendations: null, overall_score: null, analysis_mode: null, project_phase: null, high_priority_actions: [], source: null }); };

export interface ProjectWorkflowFile {
  path: string;
  scope: string;
  tool: string;
}

export interface ProjectWorkflowTool {
  tool: string;
  label: string;
  files: ProjectWorkflowFile[];
}

export interface ProjectWorkflows {
  has_any_ai_config: boolean;
  tools: ProjectWorkflowTool[];
  tool_count: number;
  file_count: number;
}

// Stub until REST endpoint is built in Phase 4+.
// The Tauri IPC bridge is not available in web deployments; using invoke() here
// would throw at runtime. Return a safe empty value instead.
export const getProjectWorkflows = (_path: string): Promise<ProjectWorkflows> =>
  Promise.resolve({
    has_any_ai_config: false,
    tools: [],
    tool_count: 0,
    file_count: 0,
  });

export const toggleFavorite = (_projectId: string): Promise<boolean> => { console.warn('[tauri-stub] toggleFavorite called — no server equivalent'); return Promise.resolve(false); };

// GitHub
export const githubGetTokenStatus = (): Promise<GitHubTokenStatus> => { console.warn('[tauri-stub] githubGetTokenStatus called — no server equivalent'); return Promise.resolve({ configured: false }); };
export const githubGetRepoInfo = (_projectPath: string): Promise<GitHubRepoInfo> => { console.warn('[tauri-stub] githubGetRepoInfo called — no server equivalent'); return Promise.resolve(null as unknown as GitHubRepoInfo); };
export const githubListPrs = (_projectPath: string, _state?: string): Promise<GitHubPR[]> => { console.warn('[tauri-stub] githubListPrs called — no server equivalent'); return Promise.resolve([]); };
export const githubCreatePr = (_projectPath: string, _title: string, _body: string, _head: string, _base: string, _draft: boolean): Promise<GitHubPR> => { console.warn('[tauri-stub] githubCreatePr called — no server equivalent'); return Promise.resolve(null as unknown as GitHubPR); };
export const githubGetPrReviews = (_projectPath: string, _prNumber: number): Promise<GitHubReview[]> => { console.warn('[tauri-stub] githubGetPrReviews called — no server equivalent'); return Promise.resolve([]); };
export const githubListIssues = (_projectPath: string, _state?: string, _labels?: string): Promise<GitHubIssue[]> => { console.warn('[tauri-stub] githubListIssues called — no server equivalent'); return Promise.resolve([]); };
export const githubCreateIssue = (_projectPath: string, _title: string, _body: string, _labels: string[], _assignees: string[]): Promise<GitHubIssue> => { console.warn('[tauri-stub] githubCreateIssue called — no server equivalent'); return Promise.resolve(null as unknown as GitHubIssue); };
export const githubListCheckRuns = (_projectPath: string, _gitRef: string): Promise<GitHubCheckRun[]> => { console.warn('[tauri-stub] githubListCheckRuns called — no server equivalent'); return Promise.resolve([]); };
export const githubListReleases = (_projectPath: string): Promise<GitHubRelease[]> => { console.warn('[tauri-stub] githubListReleases called — no server equivalent'); return Promise.resolve([]); };
export const githubListRepoNotifications = (_projectPath: string): Promise<GitHubNotification[]> => { console.warn('[tauri-stub] githubListRepoNotifications called — no server equivalent'); return Promise.resolve([]); };
export const githubImportGhToken = (): Promise<string> => { console.warn('[tauri-stub] githubImportGhToken called — no server equivalent'); return Promise.resolve(''); };
export const githubSaveToken = (_token: string): Promise<void> => { console.warn('[tauri-stub] githubSaveToken called — no server equivalent'); return Promise.resolve(); };
export const githubRemoveToken = (): Promise<void> => { console.warn('[tauri-stub] githubRemoveToken called — no server equivalent'); return Promise.resolve(); };

// File System
export const detectTechStack = (_path: string): Promise<TechStack> => { console.warn('[tauri-stub] detectTechStack called — no server equivalent'); return Promise.resolve({ framework: null, language: null, package_manager: null, database: null, test_framework: null, has_planning: false, gsd_phase_count: null, gsd_todo_count: null, gsd_has_requirements: false }); };
export const readProjectFile = (_path: string, _filename: string): Promise<string> => { console.warn('[tauri-stub] readProjectFile called — no server equivalent'); return Promise.resolve(''); };
export const readProjectDocs = (_path: string): Promise<ProjectDocs | null> => { console.warn('[tauri-stub] readProjectDocs called — no server equivalent'); return Promise.resolve(null); };
export const pickFolder = (): Promise<string | null> => { console.warn('[tauri-stub] pickFolder called — no server equivalent'); return Promise.resolve(null); };

// Enhanced Import
export const importProjectEnhanced = (_path: string, _autoSyncRoadmap: boolean, _ptySessionId?: string, _skipConversion?: boolean): Promise<ImportResult> => { console.warn('[tauri-stub] importProjectEnhanced called — no server equivalent'); return Promise.resolve(null as unknown as ImportResult); };

// Check Project Path Availability
export const checkProjectPath = (_parentPath: string, _projectName: string): Promise<boolean> => { console.warn('[tauri-stub] checkProjectPath called — no server equivalent'); return Promise.resolve(false); };

// Create New Project
export const createNewProject = (_parentPath: string, _projectName: string, _template?: string, _discoveryMode?: string, _ptySessionId?: string): Promise<CreateProjectResult> => { console.warn('[tauri-stub] createNewProject called — no server equivalent'); return Promise.resolve(null as unknown as CreateProjectResult); };

export const finalizeProjectCreation = (_projectId: string, _success: boolean): Promise<Project> => { console.warn('[tauri-stub] finalizeProjectCreation called — no server equivalent'); return Promise.resolve(null as unknown as Project); };

// Activity
export const getActivityLog = (_projectId?: string, _limit?: number): Promise<ActivityEntry[]> => { console.warn('[tauri-stub] getActivityLog called — no server equivalent'); return Promise.resolve([]); };

// Activity Event Listeners
export const onActivityLogged = (_callback: (event: ActivityEntry) => void): Promise<UnlistenFn> => { console.warn('[tauri-stub] onActivityLogged called — no server equivalent'); return Promise.resolve(() => {}); };

// ExecutionProgressEvent - REMOVED (AP-ONLY)

// Knowledge File System
export const listKnowledgeFiles = (_path: string): Promise<KnowledgeFileTree> => { console.warn('[tauri-stub] listKnowledgeFiles called — no server equivalent'); return Promise.resolve({ folders: [], total_files: 0 }); };
export const listCodeFiles = (_path: string): Promise<KnowledgeFileTree> => { console.warn('[tauri-stub] listCodeFiles called — no server equivalent'); return Promise.resolve({ folders: [], total_files: 0 }); };
export const searchKnowledgeFiles = (_path: string, _query: string): Promise<KnowledgeSearchMatch[]> => { console.warn('[tauri-stub] searchKnowledgeFiles called — no server equivalent'); return Promise.resolve([]); };
export const writeProjectFile = (_path: string, _filename: string, _content: string): Promise<void> => { console.warn('[tauri-stub] writeProjectFile called — no server equivalent'); return Promise.resolve(); };
export const deleteProjectFile = (_path: string, _filename: string): Promise<boolean> => { console.warn('[tauri-stub] deleteProjectFile called — no server equivalent'); return Promise.resolve(false); };

// Markdown Indexing
export const indexProjectMarkdown = (_projectId: string, _projectPath: string): Promise<number> => { console.warn('[tauri-stub] indexProjectMarkdown called — no server equivalent'); return Promise.resolve(0); };

export const onMarkdownIndexProgress = (_callback: (event: MarkdownIndexProgress) => void): Promise<UnlistenFn> => { console.warn('[tauri-stub] onMarkdownIndexProgress called — no server equivalent'); return Promise.resolve(() => {}); };

// Settings
export const getSettings = (): Promise<Settings> => { console.warn('[tauri-stub] getSettings called — no server equivalent'); return Promise.resolve(null as unknown as Settings); };
export const updateSettings = (_settings: Settings): Promise<Settings> => { console.warn('[tauri-stub] updateSettings called — no server equivalent'); return Promise.resolve(null as unknown as Settings); };

// First-launch onboarding
export const onboardingGetStatus = (): Promise<OnboardingStatus> => { console.warn('[tauri-stub] onboardingGetStatus called — no server equivalent'); return Promise.resolve({ completed: true, completed_at: null, user_mode: 'expert', has_api_keys: false }); };

export const onboardingDetectDependencies = (): Promise<DependencyDetectionResult> => { console.warn('[tauri-stub] onboardingDetectDependencies called — no server equivalent'); return Promise.resolve({ checked_at: '', dependencies: [] }); };

export const onboardingValidateAndStoreApiKey = (_provider: OnboardingProvider, _apiKey: string): Promise<ApiKeyValidationResult> => { console.warn('[tauri-stub] onboardingValidateAndStoreApiKey called — no server equivalent'); return Promise.resolve(null as unknown as ApiKeyValidationResult); };

export const onboardingMarkComplete = (_userMode: OnboardingUserMode): Promise<OnboardingStatus> => { console.warn('[tauri-stub] onboardingMarkComplete called — no server equivalent'); return Promise.resolve({ completed: true, completed_at: null, user_mode: _userMode, has_api_keys: false }); };

// Data Management
export interface ExportOptions {
  format: "json" | "csv";
  include_projects?: boolean;
  include_activity?: boolean;
}
export const exportData = (_options: ExportOptions): Promise<string> => { console.warn('[tauri-stub] exportData called — no server equivalent'); return Promise.resolve(''); };
export const clearAllData = (): Promise<void> => { console.warn('[tauri-stub] clearAllData called — no server equivalent'); return Promise.resolve(); };
export const clearSelectedData = (_categories: string[]): Promise<void> => { console.warn('[tauri-stub] clearSelectedData called — no server equivalent'); return Promise.resolve(); };

// Settings Management
export const resetSettings = (): Promise<Settings> => { console.warn('[tauri-stub] resetSettings called — no server equivalent'); return Promise.resolve(null as unknown as Settings); };
export const importSettings = (): Promise<Settings> => { console.warn('[tauri-stub] importSettings called — no server equivalent'); return Promise.resolve(null as unknown as Settings); };

// Event Listeners - Execution events REMOVED (AP-ONLY)

// PTY API Functions
export const ptyCreate = (_options: CreatePtyOptions): Promise<CreatePtyResult> => { console.warn('[tauri-stub] ptyCreate called — no server equivalent'); return Promise.resolve(null as unknown as CreatePtyResult); };

export const ptyAttach = (_sessionId: string, _tmuxName: string, _workingDir: string, _cols: number, _rows: number): Promise<boolean> => { console.warn('[tauri-stub] ptyAttach called — no server equivalent'); return Promise.resolve(false); };

export const ptyCheckTmux = (): Promise<string | null> => { console.warn('[tauri-stub] ptyCheckTmux called — no server equivalent'); return Promise.resolve(null); };

export const ptyListTmux = (): Promise<TmuxSessionInfo[]> => { console.warn('[tauri-stub] ptyListTmux called — no server equivalent'); return Promise.resolve([]); };

export const ptyWrite = (_sessionId: string, _data: Uint8Array): Promise<void> => { console.warn('[tauri-stub] ptyWrite called — no server equivalent'); return Promise.resolve(); };

export const ptyResize = (_sessionId: string, _cols: number, _rows: number): Promise<void> => { console.warn('[tauri-stub] ptyResize called — no server equivalent'); return Promise.resolve(); };

export const ptyClose = (_sessionId: string): Promise<number | null> => { console.warn('[tauri-stub] ptyClose called — no server equivalent'); return Promise.resolve(null); };

export const ptyDetach = (_sessionId: string): Promise<void> => { console.warn('[tauri-stub] ptyDetach called — no server equivalent'); return Promise.resolve(); };

export const ptyIsActive = (_sessionId: string): Promise<boolean> => { console.warn('[tauri-stub] ptyIsActive called — no server equivalent'); return Promise.resolve(false); };

// PTY Event Listeners
export const onPtyOutput = (_sessionId: string, _callback: (event: PtyOutputEvent) => void): Promise<UnlistenFn> => { console.warn('[tauri-stub] onPtyOutput called — no server equivalent'); return Promise.resolve(() => {}); };

export const onPtyExit = (_sessionId: string, _callback: (event: PtyExitEvent) => void): Promise<UnlistenFn> => { console.warn('[tauri-stub] onPtyExit called — no server equivalent'); return Promise.resolve(() => {}); };

// Active process info for close warnings
export interface ActiveProcessInfo {
  can_close: boolean;
  active_terminals: number;
}

// App lifecycle commands
export const canSafelyClose = (): Promise<ActiveProcessInfo> => { console.warn('[tauri-stub] canSafelyClose called — no server equivalent'); return Promise.resolve({ can_close: true, active_terminals: 0 }); };

export const forceCloseAll = (): Promise<void> => { console.warn('[tauri-stub] forceCloseAll called — no server equivalent'); return Promise.resolve(); };

// App Log Types
export interface AppLogEntry {
  id: string;
  level: string;
  target: string | null;
  message: string;
  source: string;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AppLogFilters {
  level?: string;
  source?: string;
  target?: string;
  project_id?: string;
  search?: string;
  limit?: number;
  before?: string;
}

export interface AppLogStats {
  total: number;
  by_level: { level: string; count: number }[];
  by_source: { source: string; count: number }[];
}

export interface AppLogEvent {
  id: string;
  level: string;
  target: string | null;
  message: string;
  source: string;
  project_id: string | null;
  created_at: string;
}

// App Log API Functions
export const getAppLogs = (_filters: AppLogFilters): Promise<AppLogEntry[]> => { console.warn('[tauri-stub] getAppLogs called — no server equivalent'); return Promise.resolve([]); };
export const getAppLogStats = (): Promise<AppLogStats> => { console.warn('[tauri-stub] getAppLogStats called — no server equivalent'); return Promise.resolve({ total: 0, by_level: [], by_source: [] }); };
export const getLogLevels = (): Promise<string[]> => { console.warn('[tauri-stub] getLogLevels called — no server equivalent'); return Promise.resolve([]); };
export const clearAppLogs = (_before?: string, _level?: string): Promise<number> => { console.warn('[tauri-stub] clearAppLogs called — no server equivalent'); return Promise.resolve(0); };
export const logFrontendError = (_error: string, _projectId?: string): Promise<AppLogEntry> => { console.warn('[tauri-stub] logFrontendError called — no server equivalent'); return Promise.resolve(null as unknown as AppLogEntry); };
export const logFrontendEvent = (_level: string, _message: string, _target?: string, _projectId?: string, _metadata?: Record<string, unknown>): Promise<AppLogEntry> => { console.warn('[tauri-stub] logFrontendEvent called — no server equivalent'); return Promise.resolve(null as unknown as AppLogEntry); };

// App Log Event Listener
export const onLogNew = (_callback: (event: AppLogEvent) => void): Promise<UnlistenFn> => { console.warn('[tauri-stub] onLogNew called — no server equivalent'); return Promise.resolve(() => {}); };

// Global Search
export const globalSearch = (_query: string, _limit?: number): Promise<GlobalSearchResults> => { console.warn('[tauri-stub] globalSearch called — no server equivalent'); return Promise.resolve({ projects: [], phases: [], decisions: [], knowledge: [] }); };

// ============================================================
// Terminal Power Features (Phase C)
// ============================================================

// Command History Types
export interface CommandHistoryEntry {
  id: string;
  project_id: string;
  command: string;
  source: string;
  created_at: string;
}

// Snippet Types
export interface Snippet {
  id: string;
  project_id: string | null;
  label: string;
  command: string;
  description: string | null;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface SnippetInput {
  label: string;
  command: string;
  description?: string;
  category?: string;
}

// Script Favorites Types
export interface ScriptFavorite {
  id: string;
  project_id: string;
  script_id: string;
  order_index: number;
  created_at: string;
}

// Auto-command Types
export interface AutoCommand {
  id: string;
  project_id: string;
  label: string;
  command: string;
  hook_type: string;
  enabled: boolean;
  order_index: number;
  preset: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutoCommandInput {
  label: string;
  command: string;
  hook_type?: string;
  preset?: string;
}

export interface AutoCommandPreset {
  id: string;
  label: string;
  command: string;
  hook_type: string;
}

// Command History API
export const getCommandHistory = (_projectId: string, _limit?: number): Promise<CommandHistoryEntry[]> => { console.warn('[tauri-stub] getCommandHistory called — no server equivalent'); return Promise.resolve([]); };
export const addCommandHistory = (_projectId: string, _command: string, _source?: string): Promise<CommandHistoryEntry> => { console.warn('[tauri-stub] addCommandHistory called — no server equivalent'); return Promise.resolve(null as unknown as CommandHistoryEntry); };
export const clearCommandHistory = (_projectId: string): Promise<number> => { console.warn('[tauri-stub] clearCommandHistory called — no server equivalent'); return Promise.resolve(0); };

// Script Favorites API
export const getScriptFavorites = (_projectId: string): Promise<ScriptFavorite[]> => { console.warn('[tauri-stub] getScriptFavorites called — no server equivalent'); return Promise.resolve([]); };
export const toggleScriptFavorite = (_projectId: string, _scriptId: string): Promise<boolean> => { console.warn('[tauri-stub] toggleScriptFavorite called — no server equivalent'); return Promise.resolve(false); };
export const reorderScriptFavorites = (_projectId: string, _scriptIds: string[]): Promise<void> => { console.warn('[tauri-stub] reorderScriptFavorites called — no server equivalent'); return Promise.resolve(); };

// Snippets API
export const listSnippets = (_projectId?: string): Promise<Snippet[]> => { console.warn('[tauri-stub] listSnippets called — no server equivalent'); return Promise.resolve([]); };
export const createSnippet = (_projectId: string | null, _input: SnippetInput): Promise<Snippet> => { console.warn('[tauri-stub] createSnippet called — no server equivalent'); return Promise.resolve(null as unknown as Snippet); };
export const updateSnippet = (_id: string, _input: SnippetInput): Promise<Snippet> => { console.warn('[tauri-stub] updateSnippet called — no server equivalent'); return Promise.resolve(null as unknown as Snippet); };
export const deleteSnippet = (_id: string): Promise<boolean> => { console.warn('[tauri-stub] deleteSnippet called — no server equivalent'); return Promise.resolve(false); };

// Auto-commands API
export const listAutoCommands = (_projectId: string): Promise<AutoCommand[]> => { console.warn('[tauri-stub] listAutoCommands called — no server equivalent'); return Promise.resolve([]); };
export const createAutoCommand = (_projectId: string, _input: AutoCommandInput): Promise<AutoCommand> => { console.warn('[tauri-stub] createAutoCommand called — no server equivalent'); return Promise.resolve(null as unknown as AutoCommand); };
export const updateAutoCommand = (_id: string, _input: AutoCommandInput): Promise<AutoCommand> => { console.warn('[tauri-stub] updateAutoCommand called — no server equivalent'); return Promise.resolve(null as unknown as AutoCommand); };
export const deleteAutoCommand = (_id: string): Promise<boolean> => { console.warn('[tauri-stub] deleteAutoCommand called — no server equivalent'); return Promise.resolve(false); };
export const toggleAutoCommand = (_id: string): Promise<AutoCommand> => { console.warn('[tauri-stub] toggleAutoCommand called — no server equivalent'); return Promise.resolve(null as unknown as AutoCommand); };
export const getAutoCommandPresets = (): Promise<AutoCommandPreset[]> => { console.warn('[tauri-stub] getAutoCommandPresets called — no server equivalent'); return Promise.resolve([]); };

// ============================================================
// Notifications (CC-03)
// ============================================================

export interface Notification {
  id: string;
  project_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface CreateNotificationInput {
  project_id?: string | null;
  notification_type: string;
  title: string;
  message: string;
  link?: string | null;
}

export const getNotifications = (_limit?: number, _unreadOnly?: boolean): Promise<Notification[]> => { console.warn('[tauri-stub] getNotifications called — no server equivalent'); return Promise.resolve([]); };
export const getUnreadNotificationCount = (): Promise<number> => { console.warn('[tauri-stub] getUnreadNotificationCount called — no server equivalent'); return Promise.resolve(0); };
export const createNotification = (_input: CreateNotificationInput): Promise<Notification> => { console.warn('[tauri-stub] createNotification called — no server equivalent'); return Promise.resolve(null as unknown as Notification); };
export const markNotificationRead = (_notificationId: string): Promise<Notification> => { console.warn('[tauri-stub] markNotificationRead called — no server equivalent'); return Promise.resolve(null as unknown as Notification); };
export const markAllNotificationsRead = (): Promise<number> => { console.warn('[tauri-stub] markAllNotificationsRead called — no server equivalent'); return Promise.resolve(0); };
export const clearNotifications = (): Promise<number> => { console.warn('[tauri-stub] clearNotifications called — no server equivalent'); return Promise.resolve(0); };

export const onNotificationNew = (_callback: (event: Notification) => void): Promise<UnlistenFn> => { console.warn('[tauri-stub] onNotificationNew called — no server equivalent'); return Promise.resolve(() => {}); };

// ============================================================
// Environment Info (SH-04)
// ============================================================

export interface EnvironmentInfo {
  git_branch: string | null;
  node_version: string | null;
  python_version: string | null;
  rust_version: string | null;
  working_directory: string;
}

export const getEnvironmentInfo = (_workingDir: string): Promise<EnvironmentInfo> => { console.warn('[tauri-stub] getEnvironmentInfo called — no server equivalent'); return Promise.resolve({ git_branch: null, node_version: null, python_version: null, rust_version: null, working_directory: '' }); };

// ============================================================
// Terminal Session Persistence (SH-03)
// ============================================================

export interface TerminalSession {
  id: string;
  project_id: string;
  tab_name: string;
  tab_type: string;
  working_directory: string;
  sort_order: number;
  tmux_session: string | null;
  created_at: string;
}

export interface SaveTerminalSessionInput {
  project_id: string;
  tab_name: string;
  tab_type: string;
  working_directory: string;
  sort_order: number;
  tmux_session?: string;
}

export const saveTerminalSessions = (_sessions: SaveTerminalSessionInput[]): Promise<number> => { console.warn('[tauri-stub] saveTerminalSessions called — no server equivalent'); return Promise.resolve(0); };
export const restoreTerminalSessions = (): Promise<TerminalSession[]> => { console.warn('[tauri-stub] restoreTerminalSessions called — no server equivalent'); return Promise.resolve([]); };

// ============================================================
// Phase G Types
// ============================================================

// ExecutionBookmark - REMOVED (AP-ONLY)

export interface KnowledgeBookmark {
  id: string;
  project_id: string;
  file_path: string;
  heading: string;
  heading_level: number;
  note: string | null;
  created_at: string;
}

export interface DependencyStatus {
  package_manager: string;
  outdated_count: number;
  vulnerable_count: number;
  details: Record<string, unknown> | null;
  checked_at: string;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  file_path: string;
  node_type: string;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  label: string | null;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

// ============================================================
// Phase G API Functions
// ============================================================

// Knowledge Bookmarks
export const createKnowledgeBookmark = (_projectId: string, _filePath: string, _heading: string, _headingLevel: number, _note?: string): Promise<KnowledgeBookmark> => { console.warn('[tauri-stub] createKnowledgeBookmark called — no server equivalent'); return Promise.resolve(null as unknown as KnowledgeBookmark); };
export const listKnowledgeBookmarks = (_projectId: string): Promise<KnowledgeBookmark[]> => { console.warn('[tauri-stub] listKnowledgeBookmarks called — no server equivalent'); return Promise.resolve([]); };
export const deleteKnowledgeBookmark = (_bookmarkId: string): Promise<boolean> => { console.warn('[tauri-stub] deleteKnowledgeBookmark called — no server equivalent'); return Promise.resolve(false); };

// Dependency Status
export const getDependencyStatus = (_projectId: string, _projectPath: string): Promise<DependencyStatus> => { console.warn('[tauri-stub] getDependencyStatus called — no server equivalent'); return Promise.resolve(null as unknown as DependencyStatus); };
export const invalidateDependencyCache = (_projectId: string): Promise<boolean> => { console.warn('[tauri-stub] invalidateDependencyCache called — no server equivalent'); return Promise.resolve(false); };

// Knowledge Graph
export const buildKnowledgeGraph = (_projectPath: string): Promise<KnowledgeGraph> => { console.warn('[tauri-stub] buildKnowledgeGraph called — no server equivalent'); return Promise.resolve({ nodes: [], edges: [] }); };

// File Watcher
export const watchProjectFiles = (_projectPath: string): Promise<boolean> => { console.warn('[tauri-stub] watchProjectFiles called — no server equivalent'); return Promise.resolve(false); };
export const unwatchProjectFiles = (_projectPath: string): Promise<boolean> => { console.warn('[tauri-stub] unwatchProjectFiles called — no server equivalent'); return Promise.resolve(false); };

// ============================================================
// GSD (Get Stuff Done) Integration
// ============================================================

export interface GsdProjectInfo {
  vision: string | null;
  milestone: string | null;
  version: string | null;
  core_value: string | null;
  current_focus: string | null;
  raw_content: string;
}

export interface GsdCurrentPosition {
  milestone: string | null;
  phase: string | null;
  plan: string | null;
  status: string | null;
  last_activity: string | null;
  progress: string | null;
}

export interface GsdState {
  current_position: GsdCurrentPosition | null;
  decisions: string[];
  pending_todos: string[];
  session_continuity: string | null;
  velocity: GsdVelocity | null;
  blockers: string[];
}

export interface GsdConfig {
  workflow_mode: string | null;
  model_profile: string | null;
  raw_json: Record<string, unknown> | null;
  depth: string | null;
  parallelization: boolean | null;
  commit_docs: boolean | null;
  workflow_research: boolean | null;
  workflow_inspection: boolean | null;
  workflow_plan_verification: boolean | null;
}

export interface GsdRequirement {
  req_id: string;
  description: string;
  category: string | null;
  priority: string | null;
  status: string | null;
  phase: string | null;
}

export interface GsdMilestone {
  name: string;
  version: string | null;
  phase_start: number | null;
  phase_end: number | null;
  status: string | null;
  completed_at: string | null;
}

export interface GsdTodo {
  id: string;
  title: string;
  description: string | null;
  area: string | null;
  phase: string | null;
  priority: string | null;
  is_blocker: boolean;
  files: string[] | null;
  status: string;
  source_file: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface GsdTodoInput {
  title: string;
  description?: string | null;
  area?: string | null;
  phase?: string | null;
  priority?: string | null;
  is_blocker?: boolean;
  files?: string[] | null;
}

export interface GsdDebugSession {
  id: string;
  title: string;
  error_type: string | null;
  status: string;
  summary: string | null;
  resolution: string | null;
  source_file: string | null;
  created_at: string | null;
  resolved_at: string | null;
}

export interface GsdResearchDoc {
  filename: string;
  title: string | null;
  category: string | null;
  content: string;
  source_file: string;
}

export interface GsdVerification {
  phase_number: number;
  checks_total: number;
  checks_passed: number;
  result: string | null;
  gaps: string[];
  raw_content: string;
}

export interface GsdPhaseContext {
  decisions: string[];
  deferred_ideas: string[];
  raw_content: string;
}

export interface GsdSyncResult {
  todos_synced: number;
  milestones_synced: number;
  requirements_synced: number;
  verifications_synced: number;
  plans_synced: number;
  summaries_synced: number;
  phase_research_synced: number;
  uat_synced: number;
}

export interface GsdPlan {
  phase_number: number;
  plan_number: number;
  plan_type: string | null;
  group_number: number | null;
  autonomous: boolean;
  objective: string | null;
  task_count: number;
  tasks: GsdPlanTask[];
  files_modified: string[];
  source_file: string;
}

export interface GsdPlanTask {
  name: string;
  task_type: string | null;
  files: string[];
}

export interface GsdSummary {
  phase_number: number;
  plan_number: number;
  subsystem: string | null;
  tags: string[];
  duration: string | null;
  completed: string | null;
  accomplishments: string[];
  decisions: GsdSummaryDecision[];
  files_created: string[];
  files_modified: string[];
  deviations: string | null;
  self_check: string | null;
  source_file: string;
}

export interface GsdSummaryDecision {
  decision: string;
  rationale: string | null;
}

export interface GsdPhaseResearch {
  phase_number: number;
  domain: string | null;
  confidence: string | null;
  summary: string | null;
  anti_patterns: string[];
  pitfalls: string[];
  raw_content: string;
  source_file: string;
}

export interface GsdVelocity {
  total_plans: number | null;
  avg_duration: string | null;
  total_time: string | null;
  by_phase: GsdPhaseVelocity[];
}

export interface GsdPhaseVelocity {
  phase: string;
  plans: number;
  duration: string;
  avg_per_plan: string;
}

export interface GsdMilestoneAudit {
  version: string | null;
  status: string | null;
  req_score: string | null;
  phase_score: string | null;
  integration_score: string | null;
  gaps: string[];
  tech_debt: string[];
  raw_content: string;
  source_file: string;
}

// ============================================================
// GSD Validation (VALIDATION.md per phase)
// ============================================================

export interface TaskVerification {
  task_id: string;
  requirement: string | null;
  test_type: string; // "automated" | "manual"
  status: string; // "pending" | "pass" | "fail"
}

export interface WaveTracking {
  wave_number: number;
  task_ids: string[];
  status: string | null;
  tests_passed: string | null;
  issues: string | null;
}

export interface GsdValidation {
  id: string;
  project_id: string;
  phase_number: string;
  test_framework: string | null;
  quick_run_cmd: string | null;
  full_run_cmd: string | null;
  nyquist_rate: string | null;
  task_map: TaskVerification[];
  manual_checks: string[];
  wave_tracking: WaveTracking[];
  raw_content: string | null;
  source_file: string | null;
}

// GSD invoke wrappers
export const gsdGetProjectInfo = (_projectId: string): Promise<GsdProjectInfo> => { console.warn('[tauri-stub] gsdGetProjectInfo called — no server equivalent'); return Promise.resolve(null as unknown as GsdProjectInfo); };
export const gsdGetState = (_projectId: string): Promise<GsdState> => { console.warn('[tauri-stub] gsdGetState called — no server equivalent'); return Promise.resolve(null as unknown as GsdState); };
export const gsdGetConfig = (_projectId: string): Promise<GsdConfig> => { console.warn('[tauri-stub] gsdGetConfig called — no server equivalent'); return Promise.resolve(null as unknown as GsdConfig); };
export const gsdListRequirements = (_projectId: string): Promise<GsdRequirement[]> => { console.warn('[tauri-stub] gsdListRequirements called — no server equivalent'); return Promise.resolve([]); };
export const gsdListMilestones = (_projectId: string): Promise<GsdMilestone[]> => { console.warn('[tauri-stub] gsdListMilestones called — no server equivalent'); return Promise.resolve([]); };
export const gsdListTodos = (_projectId: string, _statusFilter?: string): Promise<GsdTodo[]> => { console.warn('[tauri-stub] gsdListTodos called — no server equivalent'); return Promise.resolve([]); };
export const gsdCreateTodo = (_projectId: string, _input: GsdTodoInput): Promise<GsdTodo> => { console.warn('[tauri-stub] gsdCreateTodo called — no server equivalent'); return Promise.resolve(null as unknown as GsdTodo); };
export const gsdUpdateTodo = (_projectId: string, _todoId: string, _input: GsdTodoInput): Promise<GsdTodo> => { console.warn('[tauri-stub] gsdUpdateTodo called — no server equivalent'); return Promise.resolve(null as unknown as GsdTodo); };
export const gsdCompleteTodo = (_projectId: string, _todoId: string): Promise<GsdTodo> => { console.warn('[tauri-stub] gsdCompleteTodo called — no server equivalent'); return Promise.resolve(null as unknown as GsdTodo); };
export const gsdDeleteTodo = (_projectId: string, _todoId: string): Promise<void> => { console.warn('[tauri-stub] gsdDeleteTodo called — no server equivalent'); return Promise.resolve(); };
export const gsdListDebugSessions = (_projectId: string, _includeResolved?: boolean): Promise<GsdDebugSession[]> => { console.warn('[tauri-stub] gsdListDebugSessions called — no server equivalent'); return Promise.resolve([]); };
export const gsdGetDebugSession = (_projectId: string, _sessionId: string): Promise<GsdDebugSession> => { console.warn('[tauri-stub] gsdGetDebugSession called — no server equivalent'); return Promise.resolve(null as unknown as GsdDebugSession); };
export const gsdListResearch = (_projectId: string): Promise<GsdResearchDoc[]> => { console.warn('[tauri-stub] gsdListResearch called — no server equivalent'); return Promise.resolve([]); };
export const gsdGetVerification = (_projectId: string, _phaseNumber: number): Promise<GsdVerification> => { console.warn('[tauri-stub] gsdGetVerification called — no server equivalent'); return Promise.resolve(null as unknown as GsdVerification); };
export const gsdGetPhaseContext = (_projectId: string, _phaseNumber: number): Promise<GsdPhaseContext> => { console.warn('[tauri-stub] gsdGetPhaseContext called — no server equivalent'); return Promise.resolve(null as unknown as GsdPhaseContext); };
export const gsdListPlans = (_projectId: string): Promise<GsdPlan[]> => { console.warn('[tauri-stub] gsdListPlans called — no server equivalent'); return Promise.resolve([]); };
export const gsdGetPhasePlans = (_projectId: string, _phaseNumber: number): Promise<GsdPlan[]> => { console.warn('[tauri-stub] gsdGetPhasePlans called — no server equivalent'); return Promise.resolve([]); };
export const gsdListSummaries = (_projectId: string): Promise<GsdSummary[]> => { console.warn('[tauri-stub] gsdListSummaries called — no server equivalent'); return Promise.resolve([]); };
export const gsdGetPhaseSummaries = (_projectId: string, _phaseNumber: number): Promise<GsdSummary[]> => { console.warn('[tauri-stub] gsdGetPhaseSummaries called — no server equivalent'); return Promise.resolve([]); };
export const gsdListPhaseResearch = (_projectId: string): Promise<GsdPhaseResearch[]> => { console.warn('[tauri-stub] gsdListPhaseResearch called — no server equivalent'); return Promise.resolve([]); };
export const gsdGetPhaseResearch = (_projectId: string, _phaseNumber: number): Promise<GsdPhaseResearch> => { console.warn('[tauri-stub] gsdGetPhaseResearch called — no server equivalent'); return Promise.resolve(null as unknown as GsdPhaseResearch); };
export const gsdListMilestoneAudits = (_projectId: string): Promise<GsdMilestoneAudit[]> => { console.warn('[tauri-stub] gsdListMilestoneAudits called — no server equivalent'); return Promise.resolve([]); };
export const gsdSyncProject = (_projectId: string): Promise<GsdSyncResult> => { console.warn('[tauri-stub] gsdSyncProject called — no server equivalent'); return Promise.resolve(null as unknown as GsdSyncResult); };
export const gsdListValidations = (_projectId: string): Promise<GsdValidation[]> => { console.warn('[tauri-stub] gsdListValidations called — no server equivalent'); return Promise.resolve([]); };
export const gsdGetValidationByPhase = (_projectId: string, _phaseNumber: string): Promise<GsdValidation | null> => { console.warn('[tauri-stub] gsdGetValidationByPhase called — no server equivalent'); return Promise.resolve(null); };

export interface GsdTodoWithProject {
  id: string;
  title: string;
  description: string | null;
  area: string | null;
  phase: string | null;
  priority: string | null;
  is_blocker: boolean;
  files: string[] | null;
  status: string;
  source_file: string | null;
  created_at: string | null;
  completed_at: string | null;
  project_id: string;
  project_name: string;
}

export const gsdListAllTodos = (): Promise<GsdTodoWithProject[]> => { console.warn('[tauri-stub] gsdListAllTodos called — no server equivalent'); return Promise.resolve([]); };

// ============================================================
// GSD Roadmap Progress
// ============================================================

export interface GsdRoadmapPhaseProgress {
  name: string;
  number: number | null;
  total: number;
  completed: number;
  percent: number;
  status: 'complete' | 'in_progress' | 'pending';
}

export interface GsdRoadmapProgress {
  phases: GsdRoadmapPhaseProgress[];
  total_tasks: number;
  completed_tasks: number;
  percent: number;
  current_phase: string | null;
}

export const gsdGetRoadmapProgress = (_projectId: string): Promise<GsdRoadmapProgress | null> => { console.warn('[tauri-stub] gsdGetRoadmapProgress called — no server equivalent'); return Promise.resolve(null); };

// ============================================================
// Secrets / OS Keychain (Phase 3.4)
// ============================================================

/** Default keychain service name */
export const KEYCHAIN_SERVICE = "net.fluxlabs.vcca";

/** Store a secret in the OS keychain */
export const setSecret = (_service: string, _key: string, _value: string): Promise<void> => { console.warn('[tauri-stub] setSecret called — no server equivalent'); return Promise.resolve(); };

/** Retrieve a secret from the OS keychain (returns null if not found) */
export const getSecret = (_service: string, _key: string): Promise<string | null> => { console.warn('[tauri-stub] getSecret called — no server equivalent'); return Promise.resolve(null); };

/** Delete a secret from the OS keychain */
export const deleteSecret = (_service: string, _key: string): Promise<void> => { console.warn('[tauri-stub] deleteSecret called — no server equivalent'); return Promise.resolve(); };

/** List all stored secret key names (not values) */
export const listSecretKeys = (_service: string): Promise<string[]> => { console.warn('[tauri-stub] listSecretKeys called — no server equivalent'); return Promise.resolve([]); };

/** Get well-known/predefined secret key names */
export const getPredefinedSecretKeys = (): Promise<string[]> => { console.warn('[tauri-stub] getPredefinedSecretKeys called — no server equivalent'); return Promise.resolve([]); };

/** Check if a secret exists without retrieving its value */
export const hasSecret = (_service: string, _key: string): Promise<boolean> => { console.warn('[tauri-stub] hasSecret called — no server equivalent'); return Promise.resolve(false); };

// ============================================================
// GSD UAT (XX-UAT.md per phase, generated by /gsd:verify-work)
// ============================================================

export interface UatTestResult {
  number: number;
  test: string;
  expected: string;
  result: string; // "pass" | "issue" | "pending" | "skipped"
  notes: string | null;
}

export interface UatIssue {
  severity: string; // "blocker" | "major" | "minor" | "cosmetic"
  description: string;
}

export interface GsdUatResult {
  id: string;
  project_id: string;
  phase_number: string;
  session_number: number;
  status: string; // "testing" | "complete" | "diagnosed"
  tests: UatTestResult[];
  issues: UatIssue[];
  gaps: string[];
  diagnosis: string | null;
  raw_content: string | null;
  source_file: string | null;
  // computed
  pass_count: number;
  issue_count: number;
  pending_count: number;
}

export const gsdListUatResults = (_projectId: string): Promise<GsdUatResult[]> => { console.warn('[tauri-stub] gsdListUatResults called — no server equivalent'); return Promise.resolve([]); };

export const gsdGetUatByPhase = (_projectId: string, _phaseNumber: string): Promise<GsdUatResult | null> => { console.warn('[tauri-stub] gsdGetUatByPhase called — no server equivalent'); return Promise.resolve(null); };

// GSD-2
export const gsd2GetHealth = (_projectId: string): Promise<Gsd2Health> => { console.warn('[tauri-stub] gsd2GetHealth called — no server equivalent'); return Promise.resolve(null as unknown as Gsd2Health); };

export interface Gsd2ModelEntry {
  provider: string;
  id: string;
  name: string;
}

export interface Gsd2PlanPreviewSlice {
  id: string;
  title: string;
  goal: string;
  risk: string | null;
  depends_on: string[];
}

export interface Gsd2PlanPreviewMilestone {
  title: string;
  summary: string;
  slices: Gsd2PlanPreviewSlice[];
}

export interface Gsd2PlanPreview {
  intent: string;
  milestone: Gsd2PlanPreviewMilestone;
}

export const gsd2ListModels = (_search?: string): Promise<Gsd2ModelEntry[]> => { console.warn('[tauri-stub] gsd2ListModels called — no server equivalent'); return Promise.resolve([]); };

export const gsd2GeneratePlanPreview = (_intent: string): Promise<Gsd2PlanPreview> => { console.warn('[tauri-stub] gsd2GeneratePlanPreview called — no server equivalent'); return Promise.resolve(null as unknown as Gsd2PlanPreview); };

export interface WorktreeInfo {
  name: string;
  branch: string;
  path: string;
  exists: boolean;
  added_count: number;
  modified_count: number;
  removed_count: number;
}

export interface WorktreeDiff {
  added: string[];
  modified: string[];
  removed: string[];
  added_count: number;
  modified_count: number;
  removed_count: number;
}

export const gsd2ListWorktrees = (_projectId: string): Promise<WorktreeInfo[]> => { console.warn('[tauri-stub] gsd2ListWorktrees called — no server equivalent'); return Promise.resolve([]); };

export const gsd2RemoveWorktree = (_projectId: string, _worktreeName: string): Promise<void> => { console.warn('[tauri-stub] gsd2RemoveWorktree called — no server equivalent'); return Promise.resolve(); };

export const gsd2GetWorktreeDiff = (_projectId: string, _worktreeName: string): Promise<WorktreeDiff> => { console.warn('[tauri-stub] gsd2GetWorktreeDiff called — no server equivalent'); return Promise.resolve(null as unknown as WorktreeDiff); };

// Headless session types (Phase 4)
export interface HeadlessSnapshot {
  state: string;
  next: string | null;
  cost: number;
}

// Visualizer types (Phase 4 + expanded VisualizerData2 for R085)

// Backward-compatible node types (used by gsd2-visualizer-tab.tsx)
export interface VisualizerNode {
  id: string;
  title: string;
  status: 'done' | 'active' | 'pending';
  children: VisualizerNode[];
}

export interface CostByKey {
  key: string;
  cost: number;
}

export interface TimelineEntry {
  id: string;
  title: string;
  entry_type: string;
  completed_at: string | null;
  cost: number;
}

// Rich task node
export interface VisualizerTask2 {
  id: string;
  title: string;
  done: boolean;
  status: 'done' | 'active' | 'pending';
  estimate: string | null;
  on_critical_path: boolean;
  slack: number;
}

// Rich slice node
export interface SliceVerification2 {
  slice_id: string;
  verification_text: string;
}

export interface FileModified2 {
  path: string;
  description: string;
}

export interface ChangelogEntry2 {
  slice_id: string;
  one_liner: string;
  completed_at: string | null;
  files_modified: FileModified2[];
}

export interface VisualizerSlice2 {
  id: string;
  title: string;
  done: boolean;
  status: 'done' | 'active' | 'pending';
  risk: string | null;
  dependencies: string[];
  tasks: VisualizerTask2[];
  verification: SliceVerification2 | null;
  changelog: ChangelogEntry2[];
}

// Rich milestone node
export interface VisualizerMilestone2 {
  id: string;
  title: string;
  done: boolean;
  status: 'done' | 'active' | 'pending';
  dependencies: string[];
  slices: VisualizerSlice2[];
  discussion_state: 'discussed' | 'draft' | 'undiscussed';
  cost: number;
}

// Critical path
export interface SlackEntry {
  id: string;
  slack: number;
}

export interface CriticalPathInfo {
  path: string[];
  slack_map: SlackEntry[];
}

// Agent activity
export interface CurrentUnit {
  unit_type: string;
  unit_id: string;
  started_at: string | null;
  elapsed_ms: number;
}

export interface AgentActivityInfo {
  is_active: boolean;
  pid: number | null;
  current_unit: CurrentUnit | null;
  completed_units: number;
  total_slices: number;
}

// Knowledge / Captures / Health / Stats
export interface KnowledgeInfo2 {
  exists: boolean;
  entry_count: number;
}

export interface CapturesInfo2 {
  exists: boolean;
  pending_count: number;
}

export interface HealthInfo2 {
  active_milestone_id: string | null;
  active_slice_id: string | null;
  active_task_id: string | null;
  milestones_done: number;
  milestones_total: number;
  slices_done: number;
  slices_total: number;
  tasks_done: number;
  tasks_total: number;
}

export interface VisualizerStats2 {
  milestones_missing_summary: number;
  slices_missing_summary: number;
  recent_changelog: ChangelogEntry2[];
}

/// Full VisualizerData — the expanded shape returned by gsd2_get_visualizer_data (R085).
/// Includes backward-compatible fields (tree, cost_by_milestone, cost_by_model, timeline)
/// alongside new expanded fields.
export interface VisualizerData {
  // Rich milestone tree (new)
  milestones: VisualizerMilestone2[];

  // Backward-compatible aliases
  tree: VisualizerNode[];
  cost_by_milestone: CostByKey[];
  cost_by_model: CostByKey[];
  timeline: TimelineEntry[];

  // Critical path
  critical_path: CriticalPathInfo;

  // Agent activity
  agent_activity: AgentActivityInfo;

  // Cost aggregations (reuse T02 types)
  by_phase: PhaseAggregate[];
  by_slice: { slice_id: string; units: number; cost: number; tokens: number; duration_ms: number }[];
  by_model: { model: string; units: number; cost: number; tokens: number }[];
  units: {
    unit_type: string; id: string; model: string; started_at: number; finished_at: number;
    cost: number; input_tokens: number; output_tokens: number; cache_read_tokens: number;
    cache_write_tokens: number; total_tokens: number; tool_calls: number;
    tier: string | null; model_downgraded: boolean;
  }[];
  totals: { units: number; total_cost: number; total_tokens: number; duration_ms: number; tool_calls: number };

  // Knowledge / Captures
  knowledge: KnowledgeInfo2;
  captures: CapturesInfo2;

  // Health summary
  health: HealthInfo2;

  // Stats
  stats: VisualizerStats2;
}

// GSD-2 Headless
export const gsd2HeadlessQuery = (_projectId: string): Promise<HeadlessSnapshot> => { console.warn('[tauri-stub] gsd2HeadlessQuery called — no server equivalent'); return Promise.resolve(null as unknown as HeadlessSnapshot); };

export const gsd2HeadlessGetSession = (_projectId: string): Promise<string | null> => { console.warn('[tauri-stub] gsd2HeadlessGetSession called — no server equivalent'); return Promise.resolve(null); };

export const gsd2HeadlessUnregister = (_sessionId: string): Promise<void> => { console.warn('[tauri-stub] gsd2HeadlessUnregister called — no server equivalent'); return Promise.resolve(); };

export const gsd2HeadlessStart = (_projectId: string): Promise<string> => { console.warn('[tauri-stub] gsd2HeadlessStart called — no server equivalent'); return Promise.resolve(''); };

export const gsd2HeadlessStartWithModel = (_projectId: string, _model: string): Promise<string> => { console.warn('[tauri-stub] gsd2HeadlessStartWithModel called — no server equivalent'); return Promise.resolve(''); };

export const gsd2HeadlessStop = (_sessionId: string): Promise<void> => { console.warn('[tauri-stub] gsd2HeadlessStop called — no server equivalent'); return Promise.resolve(); };

// GSD-2 Visualizer
export const gsd2GetVisualizerData = (_projectId: string): Promise<VisualizerData> => { console.warn('[tauri-stub] gsd2GetVisualizerData called — no server equivalent'); return Promise.resolve(null as unknown as VisualizerData); };

// GSD-2 Milestones / Slices / Tasks (Phase 5)
export interface Gsd2MilestoneListItem {
  id: string;
  title: string;
  dir_name: string;
  done: boolean;
  slices: Gsd2SliceSummary[];
  dependencies: string[];
}

export interface Gsd2SliceSummary {
  id: string;
  title: string;
  done: boolean;
  risk: string | null;
  dependencies: string[];
  tasks: Gsd2TaskItem[];
}

export interface Gsd2TaskItem {
  id: string;
  title: string;
  done: boolean;
  estimate: string | null;
  files: string[];
  verify: string | null;
}

export interface Gsd2DerivedState {
  active_milestone_id: string | null;
  active_slice_id: string | null;
  active_task_id: string | null;
  phase: string | null;
  milestones_done: number;
  milestones_total: number;
  slices_done: number;
  slices_total: number;
  tasks_done: number;
  tasks_total: number;
}

export const gsd2ListMilestones = (_projectId: string): Promise<Gsd2MilestoneListItem[]> => { console.warn('[tauri-stub] gsd2ListMilestones called — no server equivalent'); return Promise.resolve([]); };

export const gsd2GetMilestone = (_projectId: string, _milestoneId: string): Promise<Gsd2MilestoneListItem> => { console.warn('[tauri-stub] gsd2GetMilestone called — no server equivalent'); return Promise.resolve(null as unknown as Gsd2MilestoneListItem); };

export const gsd2GetSlice = (_projectId: string, _milestoneId: string, _sliceId: string): Promise<Gsd2SliceSummary> => { console.warn('[tauri-stub] gsd2GetSlice called — no server equivalent'); return Promise.resolve(null as unknown as Gsd2SliceSummary); };

export const gsd2DeriveState = (_projectId: string): Promise<Gsd2DerivedState> => { console.warn('[tauri-stub] gsd2DeriveState called — no server equivalent'); return Promise.resolve(null as unknown as Gsd2DerivedState); };

// GSD-2 Diagnostics — Doctor, Forensics, Skill Health
export interface DoctorIssue {
  severity: string;
  code: string;
  scope: string;
  unit_id: string;
  message: string;
  file?: string;
  fixable: boolean;
}

export interface DoctorCodeCount {
  code: string;
  count: number;
}

export interface DoctorSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  fixable: number;
  by_code: DoctorCodeCount[];
}

export interface DoctorReport {
  ok: boolean;
  issues: DoctorIssue[];
  fixes_applied: string[];
  summary: DoctorSummary;
}

export interface DoctorFixResult {
  ok: boolean;
  fixes_applied: string[];
}

export interface ForensicAnomaly {
  type_name: string;
  severity: string;
  unit_type?: string;
  unit_id?: string;
  summary: string;
  details: string;
}

export interface ForensicRecentUnit {
  type_name: string;
  id: string;
  cost: number;
  duration: number;
  model: string;
  finished_at: number;
}

export interface ForensicCrashLock {
  pid: number;
  started_at: string;
  unit_type: string;
  unit_id: string;
  unit_started_at: string;
  completed_units: number;
  session_file?: string;
}

export interface ForensicMetricsSummary {
  total_units: number;
  total_cost: number;
  total_duration: number;
}

export interface ForensicReport {
  gsd_version: string;
  timestamp: string;
  base_path: string;
  active_milestone: string | null;
  active_slice: string | null;
  anomalies: ForensicAnomaly[];
  recent_units: ForensicRecentUnit[];
  crash_lock: ForensicCrashLock | null;
  doctor_issue_count: number;
  unit_trace_count: number;
  completed_key_count: number;
  metrics: ForensicMetricsSummary | null;
}

export interface SkillHealthEntry {
  name: string;
  total_uses: number;
  success_rate: number;
  avg_tokens: number;
  token_trend: string;
  last_used: number;
  stale_days: number;
  avg_cost: number;
  flagged: boolean;
  flag_reason?: string;
}

export interface SkillHealthSuggestion {
  skill_name: string;
  trigger: string;
  message: string;
  severity: string;
}

export interface SkillHealthReport {
  generated_at: string;
  total_units_with_skills: number;
  skills: SkillHealthEntry[];
  stale_skills: string[];
  declining_skills: string[];
  suggestions: SkillHealthSuggestion[];
}

export const gsd2GetDoctorReport = (_projectId: string): Promise<DoctorReport> => { console.warn('[tauri-stub] gsd2GetDoctorReport called — no server equivalent'); return Promise.resolve(null as unknown as DoctorReport); };

export const gsd2ApplyDoctorFixes = (_projectId: string): Promise<DoctorFixResult> => { console.warn('[tauri-stub] gsd2ApplyDoctorFixes called — no server equivalent'); return Promise.resolve(null as unknown as DoctorFixResult); };

export const gsd2GetForensicsReport = (_projectId: string): Promise<ForensicReport> => { console.warn('[tauri-stub] gsd2GetForensicsReport called — no server equivalent'); return Promise.resolve(null as unknown as ForensicReport); };

export const gsd2GetSkillHealth = (_projectId: string): Promise<SkillHealthReport> => { console.warn('[tauri-stub] gsd2GetSkillHealth called — no server equivalent'); return Promise.resolve(null as unknown as SkillHealthReport); };

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  type: string; // 'rule' | 'pattern' | 'lesson' | 'freeform'
}

export interface KnowledgeData {
  entries: KnowledgeEntry[];
  file_path: string;
  last_modified: string | null;
}

export interface CaptureEntry {
  id: string;
  text: string;
  timestamp: string;
  status: string;
  classification?: string;
  resolution?: string;
  rationale?: string;
  resolved_at?: string;
  executed?: boolean;
}

export interface CapturesData {
  entries: CaptureEntry[];
  pending_count: number;
  actionable_count: number;
}

export interface CaptureResolveResult {
  ok: boolean;
  capture_id: string;
  error?: string;
}

export const gsd2GetKnowledge = (_projectId: string): Promise<KnowledgeData> => { console.warn('[tauri-stub] gsd2GetKnowledge called — no server equivalent'); return Promise.resolve(null as unknown as KnowledgeData); };

export const gsd2GetCaptures = (_projectId: string): Promise<CapturesData> => { console.warn('[tauri-stub] gsd2GetCaptures called — no server equivalent'); return Promise.resolve(null as unknown as CapturesData); };

export const gsd2ResolveCapture = (_projectId: string, _captureId: string, _classification: string, _resolution: string, _rationale: string): Promise<CaptureResolveResult> => { console.warn('[tauri-stub] gsd2ResolveCapture called — no server equivalent'); return Promise.resolve(null as unknown as CaptureResolveResult); };

// ---- Inspect (R079) ----
export interface InspectData {
  schema_version: string | null;
  decision_count: number;
  requirement_count: number;
  recent_decisions: string[];
  recent_requirements: string[];
  decisions_file_exists: boolean;
  requirements_file_exists: boolean;
}

// ---- Steer (R080) ----
export interface SteerData {
  content: string;
  exists: boolean;
}

// ---- Undo (R081) ----
export interface UndoInfo {
  last_unit_type: string | null;
  last_unit_id: string | null;
  last_unit_cost: number;
  completed_units_count: number;
  file_exists: boolean;
}

// ---- Recovery (R084) ----
export interface RecoveryInfo {
  lock_exists: boolean;
  pid: number | null;
  started_at: string | null;
  unit_type: string | null;
  unit_id: string | null;
  unit_started_at: string | null;
  is_process_alive: boolean;
  suggested_action: string;
  session_file: string | null;
}

export const gsd2GetInspect = (_projectId: string): Promise<InspectData> => { console.warn('[tauri-stub] gsd2GetInspect called — no server equivalent'); return Promise.resolve(null as unknown as InspectData); };

export const gsd2GetSteerContent = (_projectId: string): Promise<SteerData> => { console.warn('[tauri-stub] gsd2GetSteerContent called — no server equivalent'); return Promise.resolve({ content: '', exists: false }); };

export const gsd2SetSteerContent = (_projectId: string, _content: string): Promise<void> => { console.warn('[tauri-stub] gsd2SetSteerContent called — no server equivalent'); return Promise.resolve(); };

export const gsd2GetUndoInfo = (_projectId: string): Promise<UndoInfo> => { console.warn('[tauri-stub] gsd2GetUndoInfo called — no server equivalent'); return Promise.resolve(null as unknown as UndoInfo); };

export const gsd2GetRecoveryInfo = (_projectId: string): Promise<RecoveryInfo> => { console.warn('[tauri-stub] gsd2GetRecoveryInfo called — no server equivalent'); return Promise.resolve(null as unknown as RecoveryInfo); };

// ---- History / Metrics (R078) ----
export interface UnitRecord {
  unit_type: string;
  id: string;
  model: string;
  started_at: number;
  finished_at: number;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  tool_calls: number;
  tier: string | null;
  model_downgraded: boolean;
}

export interface ProjectTotals {
  units: number;
  total_cost: number;
  total_tokens: number;
  duration_ms: number;
  tool_calls: number;
}

export interface PhaseAggregate {
  phase: string;
  units: number;
  cost: number;
  tokens: number;
  duration_ms: number;
}

export interface SliceAggregate {
  slice_id: string;
  units: number;
  cost: number;
  tokens: number;
  duration_ms: number;
}

export interface ModelAggregate {
  model: string;
  units: number;
  cost: number;
  tokens: number;
}

export interface HistoryData {
  units: UnitRecord[];
  totals: ProjectTotals;
  by_phase: PhaseAggregate[];
  by_slice: SliceAggregate[];
  by_model: ModelAggregate[];
}

export const gsd2GetHistory = (_projectId: string): Promise<HistoryData> => { console.warn('[tauri-stub] gsd2GetHistory called — no server equivalent'); return Promise.resolve(null as unknown as HistoryData); };

// ---- Hooks (R082) ----
export interface HookEntry {
  name: string;
  hook_type: string;
  triggers: string[];
  action: string | null;
  artifact: string | null;
  max_cycles: number | null;
}

export interface HooksData {
  hooks: HookEntry[];
  preferences_exists: boolean;
}

export const gsd2GetHooks = (_projectId: string): Promise<HooksData> => { console.warn('[tauri-stub] gsd2GetHooks called — no server equivalent'); return Promise.resolve(null as unknown as HooksData); };

// ---- Git Summary (R083) ----
export interface GitCommitEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitSummaryData {
  branch: string | null;
  is_dirty: boolean;
  staged_count: number;
  unstaged_count: number;
  untracked_count: number;
  recent_commits: GitCommitEntry[];
  ahead: number;
  behind: number;
  has_git: boolean;
}

export const gsd2GetGitSummary = (_projectId: string): Promise<GitSummaryData> => { console.warn('[tauri-stub] gsd2GetGitSummary called — no server equivalent'); return Promise.resolve(null as unknown as GitSummaryData); };

// ---- Export (R086) ----
export interface ExportData {
  content: string;
  format: string;
}

export const gsd2ExportProgress = (_projectId: string): Promise<ExportData> => { console.warn('[tauri-stub] gsd2ExportProgress called — no server equivalent'); return Promise.resolve(null as unknown as ExportData); };

// ---- HTML Reports (R087, R088) ----
export interface ReportEntry {
  filename: string;
  generated_at: string;
  milestone_id: string;
  milestone_title: string;
  label: string;
  kind: string;
  total_cost: number;
  total_tokens: number;
  total_duration: number;
  done_slices: number;
  total_slices: number;
  done_milestones: number;
  total_milestones: number;
  phase: string;
}

export interface ReportsIndex {
  version: number;
  project_name: string;
  project_path: string;
  gsd_version: string;
  entries: ReportEntry[];
}

export interface HtmlReportResult {
  file_path: string;
  filename: string;
  reports_dir: string;
}

export const gsd2GenerateHtmlReport = (_projectId: string): Promise<HtmlReportResult> => { console.warn('[tauri-stub] gsd2GenerateHtmlReport called — no server equivalent'); return Promise.resolve(null as unknown as HtmlReportResult); };

export const gsd2GetReportsIndex = (_projectId: string): Promise<ReportsIndex> => { console.warn('[tauri-stub] gsd2GetReportsIndex called — no server equivalent'); return Promise.resolve(null as unknown as ReportsIndex); };

// ---- Preferences (M011) ----
export interface PreferencesHookEntry {
  name: string;
  action: string;
  event: string;
  prompt?: string;
  prepend?: string;
  append?: string;
  enabled: boolean;
}

export interface PreferencesData {
  merged: Record<string, unknown>;
  scopes: Record<string, string>;
  global_raw: Record<string, unknown>;
  project_raw: Record<string, unknown>;
}

export const gsd2GetPreferences = (_projectPath: string): Promise<PreferencesData> => { console.warn('[tauri-stub] gsd2GetPreferences called — no server equivalent'); return Promise.resolve(null as unknown as PreferencesData); };

export const gsd2SavePreferences = (_projectPath: string, _scope: string, _payload: Record<string, unknown>): Promise<void> => { console.warn('[tauri-stub] gsd2SavePreferences called — no server equivalent'); return Promise.resolve(); };

// ============================================================
// Project Template Types + Invoke Wrappers (S03 - New Project Wizard)
// ============================================================

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  category: string;
  archetype: string;
  tags: string[];
}

export interface GsdPlanningTemplate {
  id: string;
  name: string;
  description: string;
  archetype: string;
}

export interface ScaffoldOptions {
  templateId: string;
  projectName: string;
  parentDirectory: string;
  gsdPlanningTemplate?: string;
  gitInit: boolean;
}

export interface ScaffoldResult {
  projectPath: string;
  projectName: string;
  templateId: string;
  filesCreated: string[];
  gsdSeeded: boolean;
  gitInitialized: boolean;
}

export const listProjectTemplates = (): Promise<ProjectTemplate[]> => { console.warn('[tauri-stub] listProjectTemplates called — no server equivalent'); return Promise.resolve([]); };

export const listGsdPlanningTemplates = (): Promise<GsdPlanningTemplate[]> => { console.warn('[tauri-stub] listGsdPlanningTemplates called — no server equivalent'); return Promise.resolve([]); };

export const scaffoldProject = (_options: ScaffoldOptions): Promise<ScaffoldResult> => { console.warn('[tauri-stub] scaffoldProject called — no server equivalent'); return Promise.resolve(null as unknown as ScaffoldResult); };

// ─── Session types ─────────────────────────────────────────────────────────────
// Backend returns raw lines from `gsd sessions` output; parsing is done client-side.
export interface GsdSessionEntry {
  raw: string;
  filename: string;
  timestamp: string;
  name: string | null;
  first_message: string | null;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
}

/**
 * Parsed/normalized session entry — now returned directly by the backend.
 * Alias for GsdSessionEntry for backwards compatibility.
 */
export type ParsedSessionEntry = GsdSessionEntry;

export interface GsdSessionMessage {
  role: string;
  content: string;
  timestamp: string;
}

export interface GsdSessionDetail {
  filename: string;
  name: string | null;
  messages: GsdSessionMessage[];
  timestamp: string;
}

export const gsd2ListSessions = (_projectId: string): Promise<GsdSessionEntry[]> => { console.warn('[tauri-stub] gsd2ListSessions called — no server equivalent'); return Promise.resolve([]); };
