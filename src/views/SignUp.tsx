import { useState } from 'react';
import { signUpWithUsername, validateUsername } from '../lib/auth';
import { useTheme } from '../lib/theme';

interface Props {
  onSwitchToSignIn: () => void;
}

export default function SignUp({ onSwitchToSignIn }: Props) {
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'invalid' | 'ok'>('idle');

  function checkUsername(value: string) {
    const err = validateUsername(value.trim());
    if (err) {
      setUsernameStatus('invalid');
    } else {
      setUsernameStatus('ok');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    const { error: signUpError } = await signUpWithUsername(
      username,
      password,
      { display_name: displayName.trim() || username.trim() },
    );

    if (signUpError) {
      setError(signUpError);
      setLoading(false);
      return;
    }
    // Auth state change handled by App.tsx — new user signs in immediately.
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: colors.bg }}>
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ background: colors.bgCard, boxShadow: `0 4px 24px ${colors.shadow}` }}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-3">
            <img src="/logo.svg" alt="T Minus logo" className="h-14 w-14 mb-1" />
          </div>
          <div className="inline-flex items-center justify-center mb-3">
            <span className="text-2xl font-extrabold tracking-widest" style={{ color: colors.textPrimary }}>
              T <span style={{ color: colors.accent }}>Minus</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Create Account</h1>
          <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>Start planning your life today</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
              Username
            </label>
            <input
              type="text"
              name="username"
              value={username}
              onChange={e => {
                setUsername(e.target.value);
                setUsernameStatus('idle');
              }}
              onBlur={() => checkUsername(username)}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                border: `1.5px solid ${
                  usernameStatus === 'invalid' ? colors.error : usernameStatus === 'ok' ? colors.success : colors.border
                }`,
                background: colors.bgInput,
                color: colors.textPrimary,
              }}
              onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
              onBlurCapture={e => {
                if (usernameStatus === 'idle' || (usernameStatus !== 'taken' && usernameStatus !== 'ok')) {
                  e.target.style.borderColor = colors.border;
                }
                e.target.style.background = colors.bgInput;
              }}
              placeholder="letters, numbers, _ and ."
            />
            {usernameStatus === 'invalid' && (
              <p className="text-xs mt-1" style={{ color: colors.error }}>
                Use only letters, numbers, underscores, and dots. No spaces.
              </p>
            )}
            {usernameStatus === 'ok' && (
              <p className="text-xs mt-1" style={{ color: colors.success }}>Username looks good.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
              Display Name <span style={{ color: colors.border, fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{ border: `1.5px solid ${colors.border}`, background: colors.bgInput, color: colors.textPrimary }}
              onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
              onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
              placeholder="Shown in your profile"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
              Password
            </label>
            <input
              type="password"
              name="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{ border: `1.5px solid ${colors.border}`, background: colors.bgInput, color: colors.textPrimary }}
              onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
              onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
              placeholder="At least 6 characters"
            />
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Minimum 6 characters.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
              Confirm Password
            </label>
            <input
              type="password"
              name="confirm-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{ border: `1.5px solid ${colors.border}`, background: colors.bgInput, color: colors.textPrimary }}
              onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
              onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
              placeholder="Confirm your password"
            />
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: colors.errorBg, color: colors.error }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-all"
            style={{
              background: loading ? '#9CA3AF' : '#7B1C3E',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: colors.textSecondary }}>
          Already have an account?{' '}
          <button onClick={onSwitchToSignIn} className="font-semibold" style={{ color: colors.accent }}>
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
