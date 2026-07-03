import { useState, useRef, useEffect } from 'react';
import { Camera, X, Check, User as UserIcon, Trash2, AlertTriangle, Sun, Moon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { updateOwnUsername, validateUsername } from '../lib/auth';
import { useTheme, type ThemeMode } from '../lib/theme';
import type { UserProfile, CalendarMode } from '../types';
import { TIMEZONES } from '../types';

interface Props {
  profile: UserProfile;
  onClose: () => void;
  onSaved: (profile: UserProfile) => void;
  onAccountDeleted: () => void;
  userId?: string | null;
}

type Tab = 'profile' | 'preferences';

export default function ProfileView({ profile, onClose, onSaved, onAccountDeleted, userId }: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  const { theme, setTheme, colors } = useTheme();

  // Profile fields
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [recoveryEmail, setRecoveryEmail] = useState(profile.recovery_email || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);

  // Preferences
  const [calendarPref, setCalendarPref] = useState<CalendarMode>(profile.calendar_pref);
  const [timezonePref, setTimezonePref] = useState(profile.timezone_pref);
  const [themePref, setThemePref] = useState<ThemeMode>((profile.theme_pref as ThemeMode) || 'light');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'invalid' | 'ok'>('idle');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile.display_name);
    setUsername(profile.username);
    setBio(profile.bio);
    setRecoveryEmail(profile.recovery_email || '');
    setAvatarUrl(profile.avatar_url);
    setCalendarPref(profile.calendar_pref);
    setTimezonePref(profile.timezone_pref);
    setThemePref((profile.theme_pref as ThemeMode) || 'light');
  }, [profile]);

  function esc(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  function checkUsername(value: string) {
    if (value.trim().toLowerCase() === profile.username.toLowerCase()) {
      setUsernameStatus('idle');
      return;
    }
    const err = validateUsername(value.trim());
    setUsernameStatus(err ? 'invalid' : 'ok');
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError(null);
    try {
      const path = `${profile.id}/avatar.png`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // Bust the cache by appending a timestamp query param
      setAvatarUrl(data.publicUrl + '?v=' + Date.now());
    } catch (err) {
      setError((err as Error).message || 'Could not upload image.');
    } finally {
      setAvatarUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.trim().toLowerCase() !== 'delete') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account/delete-account`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Could not delete account.');
      await supabase.auth.signOut();
      onAccountDeleted();
    } catch (err) {
      setDeleteError((err as Error).message || 'Could not delete account. Please try again.');
      setDeleting(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const updates: Partial<UserProfile> = {
        display_name: displayName.trim(),
        bio: bio.trim(),
        recovery_email: recoveryEmail.trim() || null,
        avatar_url: avatarUrl,
        calendar_pref: calendarPref,
        timezone_pref: timezonePref,
        theme_pref: themePref,
      };

      // Username change goes through the edge function (server-side uniqueness).
      if (username.trim().toLowerCase() !== profile.username.toLowerCase()) {
        if (usernameStatus === 'invalid') {
          setError('Please fix the username before saving.');
          setSaving(false);
          return;
        }
        const result = await updateOwnUsername(username.trim());
        if (!result.success || !result.username) {
          setError(result.error || 'Could not update username.');
          setSaving(false);
          return;
        }
        updates.username = result.username;
      }

      const { error: upErr } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id);

      if (upErr) throw upErr;

      onSaved({ ...profile, ...updates } as UserProfile);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError((err as Error).message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  const initial = (profile.display_name || profile.username).charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: colors.overlay }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={esc}
      tabIndex={-1}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ background: colors.bgCard, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.borderLight }}>
          <h2 className="text-base font-bold" style={{ color: colors.textPrimary }}>Profile & Settings</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full w-7 h-7 transition-colors hover:bg-gray-100"
            style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}
          >
            <X size={16} color="#6B6B6B" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-1">
          <TabBtn active={tab === 'profile'} onClick={() => setTab('profile')}>Profile</TabBtn>
          <TabBtn active={tab === 'preferences'} onClick={() => setTab('preferences')}>Preferences</TabBtn>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto" style={{ flex: 1 }}>
          {tab === 'profile' && (
            <div className="space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="rounded-full object-cover"
                      style={{ width: 72, height: 72, border: '2px solid #E8EBF4' }}
                    />
                  ) : (
                    <div
                      className="rounded-full flex items-center justify-center"
                      style={{ width: 72, height: 72, background: '#7B1C3E' }}
                    >
                      <span className="text-2xl font-bold text-white">{initial}</span>
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
                    style={{
                      width: 28, height: 28, background: '#1B2A4A', border: '2px solid #fff',
                      cursor: avatarUploading ? 'not-allowed' : 'pointer', opacity: avatarUploading ? 0.6 : 1,
                    }}
                    title="Change avatar"
                  >
                    <Camera size={13} color="#fff" />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#1B2A4A' }}>{profile.display_name || profile.username}</p>
                  <p className="text-xs" style={{ color: '#6B6B6B' }}>@{profile.username}</p>
                  {avatarUploading && <p className="text-xs mt-1" style={{ color: '#7B1C3E' }}>Uploading…</p>}
                </div>
              </div>

              {/* Display name */}
              <Field label="Display Name">
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </Field>

              {/* Username */}
              <Field label="Username">
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setUsernameStatus('idle'); }}
                  onBlur={() => checkUsername(username)}
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    ...inputStyle,
                    borderColor: usernameStatus === 'invalid' ? '#B91C1C' : usernameStatus === 'ok' ? '#059669' : '#C8C8C8',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
                  onBlurCapture={e => {
                    if (usernameStatus === 'idle') e.target.style.borderColor = '#C8C8C8';
                    e.target.style.background = '#F2F2F2';
                  }}
                />
                {usernameStatus === 'checking' && <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>Checking…</p>}
                {usernameStatus === 'invalid' && (
                  <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>
                    Use only letters, numbers, _ and . (3–24 chars, no spaces).
                  </p>
                )}
                {usernameStatus === 'ok' && (
                  <p className="text-xs mt-1" style={{ color: '#059669' }}>Looks good.</p>
                )}
                <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>Letters, numbers, _ and . only.</p>
              </Field>

              {/* Bio */}
              <Field label="Bio">
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
                  style={{ ...inputStyle, minHeight: '70px' }}
                  onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
                  onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
                  placeholder="A short note about yourself"
                />
              </Field>

              {/* Recovery email */}
              <Field label="Recovery Email (optional)">
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={e => setRecoveryEmail(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  placeholder="used only to reset your password"
                />
                <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
                  Not used for login. Needed only if you forget your password.
                </p>
              </Field>
            </div>
          )}

          {tab === 'preferences' && (
            <div className="space-y-5">
              <Field label="Default Calendar">
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1.5px solid #E8EBF4' }}>
                  <button
                    onClick={() => setCalendarPref('shamsi')}
                    className="flex-1 py-2.5 text-xs font-semibold transition-all"
                    style={{
                      background: calendarPref === 'shamsi' ? '#7B1C3E' : '#fff',
                      color: calendarPref === 'shamsi' ? '#fff' : '#6B6B6B',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    Shamsi (1405)
                  </button>
                  <button
                    onClick={() => setCalendarPref('gregorian')}
                    className="flex-1 py-2.5 text-xs font-semibold transition-all"
                    style={{
                      background: calendarPref === 'gregorian' ? '#7B1C3E' : '#fff',
                      color: calendarPref === 'gregorian' ? '#fff' : '#6B6B6B',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    Gregorian
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>Applied on your next sign-in.</p>
              </Field>

              <Field label="Timezone">
                <select
                  value={timezonePref}
                  onChange={e => setTimezonePref(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>Used for date display defaults.</p>
              </Field>

              <Field label="Appearance">
                <div className="flex rounded-lg overflow-hidden" style={{ border: `1.5px solid ${colors.borderLight}` }}>
                  <button
                    onClick={() => { setThemePref('light'); setTheme('light'); }}
                    className="flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                    style={{
                      background: themePref === 'light' ? colors.accent : colors.bgInput,
                      color: themePref === 'light' ? '#fff' : colors.textSecondary,
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    <Sun size={13} /> Light
                  </button>
                  <button
                    onClick={() => { setThemePref('dark'); setTheme('dark'); }}
                    className="flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                    style={{
                      background: themePref === 'dark' ? colors.accent : colors.bgInput,
                      color: themePref === 'dark' ? '#fff' : colors.textSecondary,
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    <Moon size={13} /> Dark
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>Toggle dark mode for the entire app.</p>
              </Field>

              <div
                className="rounded-lg p-4 flex items-start gap-3"
                style={{ background: '#F8F9FC', border: '1px solid #E8EBF4' }}
              >
                <UserIcon size={16} color="#1B2A4A" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#1B2A4A' }}>Account</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>
                    You sign in with your username and password. Your recovery email is only used to
                    send you a reset link if you forget your password.
                  </p>
                </div>
              </div>

              {/* Delete Account */}
              <div className="rounded-lg overflow-hidden" style={{ border: '1.5px solid #FCA5A5' }}>
                <button
                  onClick={() => { setShowDeleteConfirm(v => !v); setDeleteError(null); setDeleteConfirmText(''); }}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left transition-colors"
                  style={{ background: '#FFF5F5', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
                  onMouseLeave={e => e.currentTarget.style.background = '#FFF5F5'}
                >
                  <Trash2 size={15} color="#B91C1C" />
                  <span className="text-sm font-semibold" style={{ color: '#B91C1C' }}>Delete Account</span>
                </button>
                {showDeleteConfirm && (
                  <div className="px-4 pb-4 pt-2" style={{ background: '#FFF5F5' }}>
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle size={14} color="#B91C1C" style={{ flexShrink: 0, marginTop: 2 }} />
                      <p className="text-xs" style={{ color: '#7F1D1D' }}>
                        This will permanently delete your account and all your planner data — habits, notes, reminders, countdowns, and profile. This cannot be undone.
                      </p>
                    </div>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: '#B91C1C' }}>
                      Type <strong>delete</strong> to confirm:
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      placeholder="delete"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3"
                      style={{ border: '1.5px solid #FCA5A5', background: '#fff', color: '#111', fontFamily: 'inherit' }}
                    />
                    {deleteError && (
                      <p className="text-xs mb-2" style={{ color: '#B91C1C' }}>{deleteError}</p>
                    )}
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting || deleteConfirmText.trim().toLowerCase() !== 'delete'}
                      className="w-full py-2 rounded-lg text-sm font-bold text-white transition-opacity"
                      style={{
                        background: '#B91C1C', border: 'none',
                        cursor: deleting || deleteConfirmText.trim().toLowerCase() !== 'delete' ? 'not-allowed' : 'pointer',
                        opacity: deleting || deleteConfirmText.trim().toLowerCase() !== 'delete' ? 0.5 : 1,
                      }}
                    >
                      {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm mt-4" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg px-4 py-3 text-sm mt-4 flex items-center gap-2" style={{ background: '#D1FAE5', color: '#059669' }}>
              <Check size={14} /> Profile saved.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t" style={{ borderColor: colors.borderLight }}>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: colors.bgInput, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || usernameStatus === 'invalid'}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity"
            style={{
              background: colors.accent, border: 'none',
              cursor: saving || usernameStatus === 'invalid' ? 'not-allowed' : 'pointer',
              opacity: saving || usernameStatus === 'invalid' ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: '1.5px solid #C8C8C8',
  background: '#F2F2F2',
  color: '#111',
  fontFamily: 'inherit',
};

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = '#7B1C3E';
  e.target.style.background = '#fff';
}
function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = '#C8C8C8';
  e.target.style.background = '#F2F2F2';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-xs font-bold rounded-t-lg transition-colors"
      style={{
        color: active ? colors.accent : colors.textSecondary,
        borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
        background: 'none', border: 'none', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
