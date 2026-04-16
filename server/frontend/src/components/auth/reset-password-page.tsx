// GLSD — Reset Password Page
// Allows user to set a new password using a token from email (AUTH-07)
// Token validation is server-side; frontend only displays result (T-13-08)

import { useState, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api/client';

type PageState = 'form' | 'submitting' | 'success' | 'invalid';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<PageState>(token ? 'form' : 'invalid');

  const passwordsMatch = password === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordsMatch || !token) return;

    setState('submitting');
    try {
      await apiRequest('/reset-password/', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: password }),
      });
      setState('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (message.includes('400') || message.includes('Invalid') || message.includes('expired')) {
        setState('invalid');
      } else {
        toast.error(message);
        setState('form');
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-sm w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col items-center gap-1 mb-2">
            <img src="/gsd-logo.svg" alt="GLSD" className="h-8 w-full max-w-[120px] object-contain" />
          </div>
          <CardTitle className="text-center text-lg">GLSD</CardTitle>
        </CardHeader>

        <CardContent>
          {state === 'success' && (
            <div role="status" className="flex flex-col items-center gap-4 py-4">
              <CheckCircle className="h-12 w-12 text-primary mx-auto" />
              <h2 className="text-lg font-semibold text-center">Password reset</h2>
              <p className="text-sm text-muted-foreground text-center">
                Your password has been updated. You can now sign in with your new password.
              </p>
              <Link
                to="/login"
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {state === 'invalid' && (
            <div role="status" className="flex flex-col items-center gap-4 py-4">
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="text-lg font-semibold text-center">Invalid or expired link</h2>
              <p className="text-sm text-muted-foreground text-center">
                This password reset link is no longer valid. Please request a new one.
              </p>
              <Link
                to="/forgot-password"
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Request New Link
              </Link>
            </div>
          )}

          {(state === 'form' || state === 'submitting') && (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">Enter your new password</p>

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={state === 'submitting'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={state === 'submitting'}
                />
                {showMismatch && (
                  <p className="text-sm text-destructive">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={state === 'submitting' || !passwordsMatch || password.length < 8}
              >
                {state === 'submitting' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
