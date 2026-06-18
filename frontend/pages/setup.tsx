import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth-context';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface PwCheck {
  label: string;
  met: boolean;
}

function passwordStrength(password: string): { score: number; label: string; color: string; checks: PwCheck[] } {
  const checks: PwCheck[] = [
    { label: '8+ characters', met: password.length >= 8 },
    { label: 'Contains lowercase', met: /[a-z]/.test(password) },
    { label: 'Contains uppercase', met: /[A-Z]/.test(password) },
    { label: 'Contains number', met: /[0-9]/.test(password) },
    { label: 'Contains special character', met: /[^a-zA-Z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.met).length;
  let label: string, color: string;
  if (score <= 1) { label = 'Weak'; color = 'bg-red-500'; }
  else if (score <= 2) { label = 'Fair'; color = 'bg-orange-500'; }
  else if (score <= 3) { label = 'Good'; color = 'bg-blue-500'; }
  else { label = 'Strong'; color = 'bg-green-500'; }
  return { score, label, color, checks };
}

export default function SetupPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) { router.replace('/'); return; }
    fetch(`${API_URL}/auth/setup-status`)
      .then(r => r.json())
      .then(data => {
        if (!data.required) { router.replace('/login'); return; }
        setSetupRequired(true);
      })
      .catch(() => setError('Could not check setup status'))
      .finally(() => setChecking(false));
  }, [authLoading, user, router]);

  const pwStrength = passwordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Registration failed' }));
        throw new Error(err.error);
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (checking || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!setupRequired) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Core Agents</h1>
          <p className="text-sm text-gray-500 mb-6">Create the first admin account to get started.</p>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="text" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm" required autoComplete="email" placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded border border-gray-300 p-2 text-sm" required autoComplete="new-password" />
              <p className="text-[10px] text-gray-400 mt-1">Minimum 8 characters required</p>
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pwStrength.color}`} style={{ width: `${(pwStrength.score / 5) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-medium text-gray-500">{pwStrength.label}</span>
                  </div>
                  <div className="space-y-0.5">
                    {pwStrength.checks.map((c, i) => (
                      <p key={i} className={`text-[10px] flex items-center gap-1 ${c.met ? 'text-green-600' : 'text-gray-400'}`}>
                        {c.met ? <CheckCircle className="w-2.5 h-2.5 shrink-0" /> : <XCircle className="w-2.5 h-2.5 shrink-0" />}
                        {c.label}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button type="submit" disabled={loading} className="w-full bg-gray-900 text-white rounded p-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
              {loading ? 'Creating admin account...' : 'Create Admin Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
