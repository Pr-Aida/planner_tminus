import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onComplete: () => void;
}

export default function ResetPassword({ onComplete }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Supabase handles the recovery token in URL automatically
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(onComplete, 2000);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#EDEDEE' }}>
        <div
          className="w-full max-w-md rounded-2xl p-8 text-center"
          style={{ background: '#fff', boxShadow: '0 4px 24px rgba(27,42,74,0.15)' }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: '#D1FAE5' }}>
            <svg className="w-8 h-8" fill="none" stroke="#059669" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B2A4A' }}>Password Updated</h1>
          <p className="text-sm mt-2" style={{ color: '#68768A' }}>Redirecting to planner...</p>
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
          <h1 className="text-2xl font-bold" style={{ color: '#1B2A4A' }}>Set New Password</h1>
          <p className="text-sm mt-2" style={{ color: '#68768A' }}>Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#1B2A4A' }}>
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                border: '1.5px solid #C8C8C8',
                background: '#F2F2F2',
                color: '#111',
              }}
              onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
              onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#1B2A4A' }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                border: '1.5px solid #C8C8C8',
                background: '#F2F2F2',
                color: '#111',
              }}
              onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
              onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
              placeholder="Confirm your new password"
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
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
