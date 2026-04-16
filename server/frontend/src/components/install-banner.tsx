// GLSD - PWA install banner component
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

export function InstallBanner() {
  const { showBanner, install, dismiss } = useInstallPrompt();

  if (!showBanner) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span>Install GLSD for push notifications</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void install()}
          className="h-7 text-xs"
        >
          Install
        </Button>
        <button
          onClick={dismiss}
          className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label="Dismiss install banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
