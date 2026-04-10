// GSD Cloud -- Reconnection banner shown above terminal on WebSocket disconnect
// Per 05-UI-SPEC: 32px height, muted background, Loader2 spinner + "Reconnecting..." text

import { Loader2 } from 'lucide-react';

interface ReconnectionBannerProps {
  visible: boolean;
}

export function ReconnectionBanner({ visible }: ReconnectionBannerProps) {
  if (!visible) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 h-8 py-2 bg-muted border-b border-border animate-fade-in">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-xs font-semibold text-muted-foreground">
        Reconnecting...
      </span>
    </div>
  );
}
