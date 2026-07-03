import { useState } from 'react';
import { signInWithUsername } from '../lib/auth';
import { useTheme } from '../lib/theme';

interface Props {
  onSwitchToSignUp: () => void;
  onSwitchToForgot: () => void;
}

export default function SignIn({ onSwitchToSignUp, onSwitchToForgot }: Props) {
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await signInWithUsername(username, password);

    if (error) {
      setError(error);
      setLoading(false);
      return;
    }
    // Auth state change handled by App.tsx
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
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Welcome Back</h1>
          <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>Sign in to your planner</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                border: `1.5px solid ${colors.border}`,
                background: colors.bgInput,
                color: colors.textPrimary,
              }}
              onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
              onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
              placeholder="your_username"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                border: `1.5px solid ${colors.border}`,
                background: colors.bgInput,
                color: colors.textPrimary,
              }}
              onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
              onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
              placeholder="Enter your password"
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <button
            onClick={onSwitchToForgot}
            className="text-xs font-medium transition-colors"
            style={{ color: colors.accent }}
          >
            Forgot your password?
          </button>
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            Don't have an account?{' '}
            <button onClick={onSwitchToSignUp} className="font-semibold" style={{ color: colors.accent }}>
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
