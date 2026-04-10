// GSD Cloud — PermissionPrompt component
// Renders an inline approval UI when Claude Code requests tool permission
// T-04-10: toolInput displayed read-only; no editable fields

import { Button } from '@/components/ui/button';
import type { PermissionRequestMessage } from '@/lib/protocol';

interface PermissionPromptProps {
  request: PermissionRequestMessage;
  onRespond: (approved: boolean) => void;
}

export function PermissionPrompt({ request, onRespond }: PermissionPromptProps) {
  return (
    <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-4 mt-2 w-full">
      <h3 className="text-sm font-semibold text-amber-400 mb-2">Permission Request</h3>

      <div className="mb-2">
        <span className="text-xs text-muted-foreground mr-1">Tool:</span>
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-amber-300">
          {request.toolName}
        </code>
      </div>

      {request.toolInput && (
        <div className="mb-3">
          <span className="text-xs text-muted-foreground block mb-1">Input:</span>
          <pre className="text-xs bg-black/40 rounded p-2 max-h-32 overflow-auto font-mono text-gray-300 whitespace-pre-wrap break-all">
            {JSON.stringify(request.toolInput, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex flex-col xs:flex-row gap-2 w-full sm:w-auto">
        <Button
          size="sm"
          variant="default"
          className="flex-1 sm:flex-none bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => onRespond(true)}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="flex-1 sm:flex-none"
          onClick={() => onRespond(false)}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
