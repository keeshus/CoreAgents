import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth, useAuthConfig } from '@/lib/auth-context';
import { API_URL } from '@/lib/api-client';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { PasswordStrengthMeter } from '@/components/PasswordStrength';
import { TextField } from '@/components/ui/TextField';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const authConfig = useAuthConfig();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasSso = authConfig?.sso != null;
  const ssoName = authConfig?.sso?.name || 'SSO';

  const passwordsMatch = password === confirmPassword;
  const touchedConfirm = confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation matching server rules
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, name);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-surface rounded-xl shadow-sm border p-8">
          <h1 className="text-2xl font-bold text-on-surface mb-6">Create Account</h1>
          {error && <div className="bg-error-container border border-red-200 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}

          {hasSso && (
            <>
              <a
                href={`${API_URL}/auth/sso/login`}
                className="flex items-center justify-center gap-2 w-full border-2 border-outline text-on-surface-variant rounded p-2.5 text-sm font-medium hover:bg-surface-container-high hover:border-outline transition-colors mb-4"
              >
                <Icon name="login" className="text-xl" />
                Register with {ssoName}
              </a>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 border-t border-outline-variant" />
                <span className="text-xs text-on-surface-variant">or</span>
                <div className="flex-1 border-t border-outline-variant" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <TextField label="Name" value={name} onChange={setName} />
            </div>
            <div>
              <TextField label="Email" value={email} onChange={setEmail} />
            </div>
            <div>
<TextField label="Password" type="password" value={password} onChange={setPassword} helpText="Minimum 8 characters required" showPasswordToggle />
               {password.length > 0 && <PasswordStrengthMeter password={password} />}
            </div>
            <div>
               <TextField label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} showPasswordToggle />
              {touchedConfirm && (
                <p className={`mt-1 text-xs flex items-center gap-1 ${passwordsMatch ? 'text-green-600' : 'text-red-600'}`}>
                  {passwordsMatch ? <Icon name="check_circle" className="text-xs shrink-0" /> : <Icon name="cancel" className="text-xs shrink-0" />}
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>
            <button type="submit" disabled={loading} className="w-full m3-button disabled:opacity-50">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          <p className="text-xs text-on-surface-variant mt-4 text-center">
            Already have an account? <Link href="/login" className="text-primary hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
