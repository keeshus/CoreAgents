import { Icon } from '@/components/ui/Icon';

export interface PwCheck {
  label: string;
  met: boolean;
}

export function passwordStrength(password: string): { score: number; label: string; color: string; checks: PwCheck[] } {
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

export function PasswordStrengthMeter({ password }: { password: string }) {
  const pw = passwordStrength(password);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pw.color}`} style={{ width: `${(pw.score / 5) * 100}%` }} />
        </div>
        <span className="text-[10px] font-medium text-gray-500">{pw.label}</span>
      </div>
      <div className="space-y-0.5">
        {pw.checks.map((c, i) => (
          <p key={i} className={`text-[10px] flex items-center gap-1 ${c.met ? 'text-green-600' : 'text-gray-400'}`}>
            {c.met ? <Icon name="check_circle" className="text-[10px] shrink-0" /> : <Icon name="cancel" className="text-[10px] shrink-0" />}
            {c.label}
          </p>
        ))}
      </div>
    </div>
  );
}
