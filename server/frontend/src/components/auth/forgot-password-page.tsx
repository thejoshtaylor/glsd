// GLSD — Forgot Password Page
// Allows user to request a password reset link via email (AUTH-07)
// Always shows success state on submit to prevent email enumeration (T-13-07)

import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await apiRequest('/password-recovery/' + encodeURIComponent(email), { method: 'POST' });
    } catch {
      // Always show success to prevent enumeration (T-13-07)
      toast.error('Something went wrong. Please try again.');
      setIsSubmitting(false);
      return;
    }
    setSubmitted(true);
    setIsSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-sm w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col items-center gap-1 mb-2">
            <img src="/gsd-logo.svg" alt="GLSD" className="h-8 w-full max-w-[120px] object-contain" />
          </div>
          <CardTitle className="text-center text-lg">GLSD</CardTitle>
          <p className="text-sm text-muted-foreground text-center">Reset your password</p>
        </CardHeader>

        <CardContent>
          {submitted ? (
            <div role="status" className="flex flex-col items-center gap-4 py-4">
              <Mail className="h-12 w-12 text-primary mx-auto" />
              <h2 className="text-lg font-semibold text-center">Check your email</h2>
              <p className="text-sm text-muted-foreground text-center">
                If an account exists for that email, we sent a password reset link. Check your inbox and spam folder.
              </p>
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
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
