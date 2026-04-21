// GLSD - Projects Page
// Project management with search filtering against cloud API
// Adapted from VCCA for slim ProjectPublic model

import { useState, useMemo } from "react";
import {
  Plus,
  FolderOpen,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BlankProjectDialog, ProjectCard } from "@/components/projects";
import { SkeletonProjectItem } from "@/components/ui/skeleton";
import { useProjectsWithStats } from "@/lib/queries";
import { PageHeader } from "@/components/layout/page-header";

export function ProjectsPage() {
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { data: projects, isLoading } = useProjectsWithStats();

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter((p) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [projects, searchQuery]);

  return (
    <div className="h-full overflow-auto p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Projects"
        description="Manage and browse all your projects"
        icon={<FolderOpen className="h-6 w-6 text-muted-foreground" />}
        actions={
          <Button onClick={() => setAddProjectOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Project
          </Button>
        }
      />

      {/* Search Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isLoading
              ? "Loading..."
              : `${filteredProjects.length} project${filteredProjects.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <SkeletonProjectItem />
              <SkeletonProjectItem />
              <SkeletonProjectItem />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <div className="p-4 rounded-full bg-muted w-fit mx-auto mb-4">
                <FolderOpen className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">
                {searchQuery ? "No Matching Projects" : "No Projects Yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-5">
                {searchQuery
                  ? "Try adjusting your search"
                  : "Create a project to get started"}
              </p>
              {!searchQuery && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    onClick={() => setAddProjectOpen(true)}
                    variant="default"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Project
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BlankProjectDialog open={addProjectOpen} onOpenChange={setAddProjectOpen} />
    </div>
  );
}
