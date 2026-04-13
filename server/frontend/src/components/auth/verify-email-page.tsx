// GSD Cloud — Email Verification Page
// Verifies email token on mount and displays result (AUTH-08)
// Token from URL query param is untrusted; server validates (T-13-08)

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/api/client';

type PageState = 'verifying' | 'success' | 'already-verified' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<PageState>(token ? 'verifying' : 'error');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const result = await apiRequest<{ message: string }>(
          '/verify-email?token=' + encodeURIComponent(token!),
          { method: 'POST' },
        );
        if (cancelled) return;
        if (result.message === 'Email already verified') {
          setState('already-verified');
        } else {
          setState('success');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    }

    void verify();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-sm w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col items-center gap-1 mb-2">
            <img src="/gsd-logo.svg" alt="GSD" className="h-8 w-full max-w-[120px] object-contain" />
          </div>
          <CardTitle className="text-center text-lg">GSD Cloud</CardTitle>
        </CardHeader>

        <CardContent>
          {state === 'verifying' && (
            <div aria-busy="true" aria-live="polite" className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <h2 className="text-lg font-semibold text-center">Verifying your email...</h2>
              <p className="text-sm text-muted-foreground text-center">
                Please wait while we verify your email address.
              </p>
            </div>
          )}

          {state === 'success' && (
            <div role="status" className="flex flex-col items-center gap-4 py-4">
              <CheckCircle className="h-12 w-12 text-primary mx-auto" />
              <h2 className="text-lg font-semibold text-center">Email verified</h2>
              <p className="text-sm text-muted-foreground text-center">
                Your email has been verified. You now have full access to GSD Cloud.
              </p>
              <Link
                to="/"
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Continue to Dashboard
              </Link>
            </div>
          )}

          {state === 'already-verified' && (
            <div role="status" className="flex flex-col items-center gap-4 py-4">
              <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto" />
              <h2 className="text-lg font-semibold text-center">Already verified</h2>
              <p className="text-sm text-muted-foreground text-center">
                This email has already been verified.
              </p>
              <Link
                to="/"
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {state === 'error' && (
            <div role="status" className="flex flex-col items-center gap-4 py-4">
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="text-lg font-semibold text-center">Invalid or expired link</h2>
              <p className="text-sm text-muted-foreground text-center">
                This verification link is no longer valid. You can request a new one from your dashboard.
              </p>
              <Link
                to="/"
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
