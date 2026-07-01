import { useState } from 'react';
import { recoverPasswordByUsername } from '../lib/auth';

interface Props {
  onSwitchToSignIn: () => void;
}

export default function ForgotPassword({ onSwitchToSignIn }: Props) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await recoverPasswordByUsername(username);

    if (error) {
      setError(error);
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#EDEDEE' }}>
        <div
          className="w-full max-w-md rounded-2xl p-8 text-center"
          style={{ background: '#fff', boxShadow: '0 4px 24px rgba(27,42,74,0.15)' }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: '#F5E6EC' }}>
            <svg className="w-8 h-8" fill="none" stroke="#7B1C3E" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B2A4A' }}>Recovery Email Sent</h1>
          <p className="text-sm mt-2" style={{ color: '#68768A' }}>
            If a recovery email is set for <strong style={{ color: '#1B2A4A' }}>{username}</strong>,
            a reset link is on its way.
          </p>
          <p className="text-xs mt-4" style={{ color: '#9CA3AF' }}>
            Check your inbox and spam folder.
          </p>
          <button
            onClick={onSwitchToSignIn}
            className="mt-6 text-xs font-semibold"
            style={{ color: '#7B1C3E' }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#EDEDEE' }}>
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{ background: '#fff', boxShadow: '0 4px 24px rgba(27,42,74,0.15)' }}
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: '#1B2A4A' }}>Forgot Password</h1>
          <p className="text-sm mt-2" style={{ color: '#68768A' }}>
            Enter your username and we'll send a reset link to your recovery email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#1B2A4A' }}>
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
              style={{ border: '1.5px solid #C8C8C8', background: '#F2F2F2', color: '#111' }}
              onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
              onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
              placeholder="your_username"
            />
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
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
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: '#68768A' }}>
          Remember your password?{' '}
          <button onClick={onSwitchToSignIn} className="font-semibold" style={{ color: '#7B1C3E' }}>
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
