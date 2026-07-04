import { useState, useRef, useEffect } from 'react';
import { Camera, X, Check, Trash2, AlertTriangle, Sun, Moon, Sparkles, Gift } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { updateOwnUsername, validateUsername } from '../lib/auth';
import { useTheme, type ThemeMode } from '../lib/theme';
import type { UserProfile, CalendarMode } from '../types';
import { TIMEZONES } from '../types';
import FeedbackSection from './FeedbackSection';

interface Props {
  profile: UserProfile;
  onClose: () => void;
  onSaved: (profile: UserProfile) => void;
  onAccountDeleted: () => void;
  onRestartTour: () => void;
  onOpenWhatsNew: () => void;
  userId?: string | null;
  initialTab?: Tab;
}

type Tab = 'profile' | 'preferences' | 'feedback';

export default function ProfileView({ profile, onClose, onSaved, onAccountDeleted, onRestartTour, onOpenWhatsNew, userId, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab || 'profile');
  const { theme, setTheme, colors } = useTheme();

  // Profile fields
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
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
    setAvatarUrl(profile.avatar_url);
    setCalendarPref(profile.calendar_pref);
    setTimezonePref(profile.timezone_pref);
    setThemePref((profile.theme_pref as ThemeMode) || 'light');
  }, [profile]);

  async function handleAvatarUpload(file: File) {
    if (!userId) return;
    setAvatarUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarUrl(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Avatar upload failed.');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    const usernameErr = validateUsername(username.trim());
    if (usernameErr) {
      setError(usernameErr);
      setSaving(false);
      return;
    }

    try {
      if (username.trim() !== profile.username) {
        const { error: unameErr } = await updateOwnUsername(username.trim());
        if (unameErr) {
          setError(unameErr);
          setSaving(false);
          return;
        }
      }

      const updates: Partial<UserProfile> = {
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl,
        calendar_pref: calendarPref,
        timezone_pref: timezonePref,
        theme_pref: themePref,
      };

      const { data, error: updErr } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId || profile.id)
        .select('*')
        .maybeSingle();

      if (updErr) throw updErr;
      if (data) {
        onSaved(data as UserProfile);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!userId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) {
        await supabase.auth.signOut();
      }
      onAccountDeleted();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  }

  function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = 'var(--theme-accent, #7B1C3E)';
    e.target.style.background = 'var(--theme-bg-card, #fff)';
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = 'var(--theme-border, #C8C8C8)';
    e.target.style.background = 'var(--theme-bg-input, #F2F2F2)';
  }

  const inputStyle: React.CSSProperties = {
    border: `1.5px solid ${colors.border}`,
    background: colors.bgInput,
    color: colors.textPrimary,
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl my-8" style={{ background: colors.bgCard, boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10" style={{ background: colors.bgCard, borderBottom: `1px solid ${colors.borderLight}`, borderRadius: '16px 16px 0 0' }}>
          <h2 className="text-lg font-bold" style={{ color: colors.textPrimary }}>Profile</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          <TabBtn active={tab === 'profile'} onClick={() => setTab('profile')} colors={colors}>Profile</TabBtn>
          <TabBtn active={tab === 'preferences'} onClick={() => setTab('preferences')} colors={colors}>Preferences</TabBtn>
          <TabBtn active={tab === 'feedback'} onClick={() => setTab('feedback')} colors={colors}>Feedback</TabBtn>
        </div>

        <div className="px-6 py-4">
          {tab === 'profile' && (
            <div className="space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white" style={{ background: colors.accent }}>
                      {(displayName || username || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: colors.accent, border: `2px solid ${colors.bgCard}`, cursor: avatarUploading ? 'not-allowed' : 'pointer' }}
                  >
                    {avatarUploading ? <span className="text-[8px]">…</span> : <Camera size={12} color="#fff" />}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{displayName || username}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>@{username}</p>
                </div>
              </div>

              <Field label="Display Name">
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  placeholder="Your display name"
                />
              </Field>

              <Field label="Username">
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setUsernameStatus('idle'); }}
                  onBlur={() => { const err = validateUsername(username.trim()); setUsernameStatus(err ? 'invalid' : 'ok'); }}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    ...inputStyle,
                    border: `1.5px solid ${usernameStatus === 'invalid' ? colors.error : usernameStatus === 'ok' ? colors.success : colors.border}`,
                  }}
                  onFocus={onFocus}
                  onBlurCapture={onBlur}
                  placeholder="username"
                />
                {usernameStatus === 'invalid' && <p className="text-xs mt-1" style={{ color: colors.error }}>Invalid username.</p>}
                {usernameStatus === 'ok' && <p className="text-xs mt-1" style={{ color: colors.success }}>Username looks good.</p>}
              </Field>

              <Field label="Bio">
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
                  style={{ ...inputStyle, minHeight: '70px' }}
                  onFocus={e => { e.target.style.borderColor = 'var(--theme-accent, #7B1C3E)'; e.target.style.background = 'var(--theme-bg-card, #fff)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--theme-border, #C8C8C8)'; e.target.style.background = 'var(--theme-bg-input, #F2F2F2)'; }}
                  placeholder="A short note about yourself"
                />
              </Field>
            </div>
          )}

          {tab === 'preferences' && (
            <div className="space-y-5">
              <Field label="Default Calendar">
                <div className="flex rounded-lg overflow-hidden" style={{ border: `1.5px solid ${colors.borderLight}` }}>
                  <CalBtn active={calendarPref === 'shamsi'} onClick={() => setCalendarPref('shamsi')} colors={colors}>Shamsi</CalBtn>
                  <CalBtn active={calendarPref === 'gregorian'} onClick={() => setCalendarPref('gregorian')} colors={colors}>Gregorian</CalBtn>
                </div>
              </Field>

              <Field label="Timezone">
                <select
                  value={timezonePref}
                  onChange={e => setTimezonePref(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </Field>

              <Field label="Theme">
                <div className="flex rounded-lg overflow-hidden" style={{ border: `1.5px solid ${colors.borderLight}` }}>
                  <button
                    onClick={() => { setThemePref('light'); setTheme('light'); }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold flex-1"
                    style={{ background: themePref === 'light' ? colors.accent : 'transparent', color: themePref === 'light' ? '#fff' : colors.textPrimary, border: 'none', cursor: 'pointer' }}
                  >
                    <Sun size={14} /> Light
                  </button>
                  <button
                    onClick={() => { setThemePref('dark'); setTheme('dark'); }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold flex-1"
                    style={{ background: themePref === 'dark' ? colors.accent : 'transparent', color: themePref === 'dark' ? '#fff' : colors.textPrimary, border: 'none', cursor: 'pointer' }}
                  >
                    <Moon size={14} /> Dark
                  </button>
                </div>
              </Field>

              <div className="pt-2 space-y-2">
                <button onClick={onRestartTour} className="flex items-center gap-2 text-xs font-semibold" style={{ color: colors.accent, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Sparkles size={14} /> Restart tour
                </button>
                <button onClick={onOpenWhatsNew} className="flex items-center gap-2 text-xs font-semibold" style={{ color: colors.accent, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Gift size={14} /> What's new
                </button>
              </div>
            </div>
          )}

          {tab === 'feedback' && (
            <div className="space-y-5">
              <FeedbackSection pageRoute={window.location.pathname + window.location.hash} />
            </div>
          )}

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm mt-4" style={{ background: colors.errorBg, color: colors.error }}>
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg px-4 py-3 text-sm mt-4 flex items-center gap-2" style={{ background: colors.successBg, color: colors.success }}>
              <Check size={14} /> Profile saved.
            </div>
          )}

          {/* Save button (profile + preferences tabs only) */}
          {tab !== 'feedback' && (
            <div className="pt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-lg py-2.5 text-sm font-bold text-white transition-opacity"
                style={{ background: saving ? '#9CA3AF' : colors.accent, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}

          {/* Delete account */}
          {tab === 'profile' && (
            <div className="pt-6 border-t" style={{ borderColor: colors.borderLight }}>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 text-xs font-semibold"
                  style={{ color: colors.error, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <Trash2 size={14} /> Delete account
                </button>
              ) : (
                <div className="rounded-lg p-4" style={{ background: colors.errorBg, border: `1px solid ${colors.error}` }}>
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle size={16} color={colors.error} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: colors.error }}>Delete account permanently?</p>
                      <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>This cannot be undone. All your data will be lost.</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3"
                    style={inputStyle}
                  />
                  {deleteError && <p className="text-xs mb-2" style={{ color: colors.error }}>{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError(null); }}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold"
                      style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting || deleteConfirmText !== 'DELETE'}
                      className="flex-1 py-2 rounded-lg text-xs font-bold text-white"
                      style={{ background: deleting ? '#9CA3AF' : colors.error, border: 'none', cursor: deleting || deleteConfirmText !== 'DELETE' ? 'not-allowed' : 'pointer' }}
                    >
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

function TabBtn({ active, onClick, colors, children }: { active: boolean; onClick: () => void; colors: ReturnType<typeof useTheme>['colors']; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
      style={{
        background: active ? colors.accent : 'transparent',
        color: active ? '#fff' : colors.textSecondary,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function CalBtn({ active, onClick, colors, children }: { active: boolean; onClick: () => void; colors: ReturnType<typeof useTheme>['colors']; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-4 py-2 text-xs font-semibold"
      style={{
        background: active ? colors.accent : 'transparent',
        color: active ? '#fff' : colors.textPrimary,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
