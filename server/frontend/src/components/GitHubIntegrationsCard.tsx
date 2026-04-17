import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Github, Trash2, Loader2 } from "lucide-react";
import { getInstallUrl, listInstallations, deleteInstallation } from "@/lib/api/github";
import type { GitHubInstallation } from "@/lib/api/github";

export function GitHubIntegrationsCard() {
  const queryClient = useQueryClient();

  const { data: installations = [], isLoading, isError } = useQuery({
    queryKey: ["github-installations"],
    queryFn: listInstallations,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInstallation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-installations"] });
    },
  });

  const handleInstall = async () => {
    try {
      const data = await getInstallUrl();
      window.location.href = data.url;
    } catch {
      // ignore
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Github className="h-4 w-4" />
          GitHub App
        </CardTitle>
        <Button size="sm" onClick={handleInstall}>
          Install GitHub App
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading installations…
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive">Failed to load installations.</p>
        )}
        {!isLoading && !isError && installations.length === 0 && (
          <p className="text-sm text-muted-foreground">No installations yet.</p>
        )}
        {!isLoading && !isError && installations.length > 0 && (
          <ul className="space-y-2">
            {installations.map((inst: GitHubInstallation) => (
              <li
                key={inst.id}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/15 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{inst.account_login}</span>
                  <Badge variant="secondary" className="text-xs">
                    {inst.account_type}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(inst.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
