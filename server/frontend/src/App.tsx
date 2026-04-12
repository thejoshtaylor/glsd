// GSD Cloud — Main App Component
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { MainLayout } from "./components/layout/main-layout";
import { ErrorBoundary } from "./components/error-boundary";
import { TerminalProvider } from "./contexts/terminal-context";
import { Dashboard } from "./pages/dashboard";
import { AuthProvider } from "@/contexts/auth-context";
import { ActivityProvider } from "@/contexts/activity-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { LoginPage } from "@/components/auth/login-page";
import { Loader2 } from "lucide-react";

// Lazy-loaded page components for route-level code splitting
const ProjectPage = lazy(() => import("./pages/project").then(m => ({ default: m.ProjectPage })));
const SettingsPage = lazy(() => import("./pages/settings").then(m => ({ default: m.SettingsPage })));
const ShellAsTerminalPage = lazy(() => import("./pages/shell").then(m => ({ default: m.ShellPage })));
const ProjectsPage = lazy(() => import("./pages/projects").then(m => ({ default: m.ProjectsPage })));
const InboxPage = lazy(() => import("./pages/inbox").then(m => ({ default: m.InboxPage })));
const PortfolioPage = lazy(() => import("./pages/portfolio").then(m => ({ default: m.PortfolioPage })));
const SearchPage = lazy(() => import("./pages/search").then(m => ({ default: m.SearchPage })));
const ReviewPage = lazy(() => import("./pages/review").then(m => ({ default: m.ReviewPage })));
const LogsPage = lazy(() => import("./pages/logs").then(m => ({ default: m.LogsPage })));
const NotificationsPage = lazy(() => import("./pages/notifications").then(m => ({ default: m.NotificationsPage })));
const TodosPage = lazy(() => import("./pages/todos").then(m => ({ default: m.TodosPage })));
const GsdPreferencesPage = lazy(() => import("./pages/gsd-preferences").then(m => ({ default: m.GsdPreferencesPage })));
const NodesPage = lazy(() => import("./components/nodes/nodes-page").then(m => ({ default: m.NodesPage })));
const NodeDetailPage = lazy(() => import("./components/nodes/node-detail-page").then(m => ({ default: m.NodeDetailPage })));
const NodeFileBrowserPage = lazy(() => import("./components/nodes/node-file-browser-page").then(m => ({ default: m.NodeFileBrowserPage })));
const NodeSessionPage = lazy(() => import("./components/nodes/node-session-page").then(m => ({ default: m.NodeSessionPage })));
const UsagePage = lazy(() => import("./pages/usage").then(m => ({ default: m.UsagePage })));
const SessionRedirectPage = lazy(() => import("./pages/session-redirect").then(m => ({ default: m.SessionRedirectPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary label="Application">
      <AuthProvider>
        <TerminalProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <ActivityProvider>
                    <MainLayout>
                      <ErrorBoundary label="Page" inline>
                        <Suspense fallback={<PageLoader />}>
                          <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/projects" element={<ProjectsPage />} />
                            <Route path="/inbox" element={<InboxPage />} />
                            <Route path="/portfolio" element={<PortfolioPage />} />
                            <Route path="/search" element={<SearchPage />} />
                            <Route path="/review" element={<ReviewPage />} />
                            <Route path="/projects/:id" element={<ProjectPage />} />
                            <Route path="/todos" element={<TodosPage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/gsd-preferences" element={<GsdPreferencesPage />} />
                            <Route path="/terminal" element={<ShellAsTerminalPage />} />
                            <Route path="/terminal/:projectId" element={<ShellAsTerminalPage />} />
                            <Route path="/logs" element={<LogsPage />} />
                            <Route path="/notifications" element={<NotificationsPage />} />
                            <Route path="/nodes" element={<NodesPage />} />
                            <Route path="/nodes/:nodeId" element={<NodeDetailPage />} />
                            <Route path="/nodes/:nodeId/files" element={<NodeFileBrowserPage />} />
                            <Route path="/nodes/:nodeId/session" element={<NodeSessionPage />} />
                            <Route path="/usage" element={<UsagePage />} />
                            <Route path="/sessions/:id" element={<SessionRedirectPage />} />
                          </Routes>
                        </Suspense>
                      </ErrorBoundary>
                    </MainLayout>
                  </ActivityProvider>
                </ProtectedRoute>
              } />
            </Routes>
            <Toaster
              position="bottom-right"
              toastOptions={{
                className: "bg-background border-border text-foreground",
                duration: 8000,
              }}
            />
          </BrowserRouter>
        </TerminalProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
