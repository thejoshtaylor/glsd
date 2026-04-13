// GSD Cloud — Email Verification Banner
// Persistent banner for unverified users with resend capability (AUTH-08)
// Banner is informational UX; actual enforcement is server-side via 403 (T-13-09)

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest } from '@/lib/api/client';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  // Don't render if user is verified or not loaded
  if (!user || user.email_verified) return null;

  // Determine if past 7-day grace period
  const isUrgent = user.created_at
    ? Date.now() - new Date(user.created_at).getTime() > 7 * 24 * 60 * 60 * 1000
    : false;

  const handleResend = useCallback(async () => {
    if (cooldown || isSending) return;
    setIsSending(true);
    try {
      await apiRequest('/resend-verification', { method: 'POST' });
      toast.success('Verification email sent. Check your inbox.');
      setCooldown(true);
      setTimeout(() => setCooldown(false), 60000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (message.includes('wait')) {
        toast.error('Please wait before requesting another email.');
      } else {
        toast.error(message);
      }
    } finally {
      setIsSending(false);
    }
  }, [cooldown, isSending]);

  return (
    <div
      role="alert"
      className="mx-4 mt-2 mb-0 flex items-center gap-3 rounded-md border border-status-warning/20 bg-status-warning/10 px-4 py-2"
    >
      <AlertTriangle className="h-4 w-4 text-status-warning flex-shrink-0" />
      <p className="text-sm flex-1">
        {isUrgent
          ? 'Your account is in read-only mode. Verify your email to restore full access.'
          : 'Please verify your email address to maintain full access.'}
      </p>
      <button
        onClick={() => void handleResend()}
        disabled={isSending || cooldown}
        className="text-sm text-primary hover:text-primary/80 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {isSending ? 'Sending...' : 'Resend Verification Email'}
      </button>
    </div>
  );
}
