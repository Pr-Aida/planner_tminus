// Username-based auth helpers built on top of Supabase email/password auth.
//
// Usernames are not natively supported by Supabase Auth, so we map each
// username to a synthetic internal email of the form
//   <lowercased-username>@username.local
// and use that as the auth identifier. The real, human-facing username is
// stored in the `profiles` table and is the only thing users ever see.
//
// Passwords are hashed and managed entirely by Supabase Auth — no plain-text
// or custom password storage exists anywhere in this app.

import { supabase } from './supabase';

export const USERNAME_REGEX = /^[A-Za-z0-9_.]+$/;
const MIN_USERNAME = 3;
const MAX_USERNAME = 24;
const MIN_PASSWORD = 6;
const SYNTHETIC_DOMAIN = 'username.local';

export function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < MIN_USERNAME) return `Username must be at least ${MIN_USERNAME} characters.`;
  if (u.length > MAX_USERNAME) return `Username must be at most ${MAX_USERNAME} characters.`;
  if (!USERNAME_REGEX.test(u)) return 'Use only letters, numbers, underscores, and dots. No spaces.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  return null;
}

function syntheticEmail(username: string): string {
  return `${username.toLowerCase()}@${SYNTHETIC_DOMAIN}`;
}

export interface SignUpResult {
  success: boolean;
  error?: string;
}

export async function signUpWithUsername(
  username: string,
  password: string,
  profile?: { display_name?: string },
): Promise<SignUpResult> {
  const cleanUsername = username.trim();

  const usernameErr = validateUsername(cleanUsername);
  if (usernameErr) return { success: false, error: usernameErr };

  const passwordErr = validatePassword(password);
  if (passwordErr) return { success: false, error: passwordErr };

  // Server-side signup via edge function: creates the auth user with the
  // synthetic email already confirmed (synthetic emails can't receive a
  // confirmation link), plus the profile row, in one atomic flow. This keeps
  // the service-role key off the client and works regardless of whether
  // email confirmation is enabled in Supabase Auth.
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account/sign-up`;
  let res: Response;
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        username: cleanUsername,
        password,
        display_name: profile?.display_name || cleanUsername,
      }),
    });
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }

  let body: unknown = null;
  try { body = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const msg = (body as { error?: string })?.error || 'Sign-up failed. Please try again.';
    return { success: false, error: msg };
  }

  // Account created + email confirmed server-side; sign in now.
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: syntheticEmail(cleanUsername),
    password,
  });

  if (signInErr) {
    return {
      success: false,
      error: 'Account created! Please sign in with your username and password.',
    };
  }

  return { success: true };
}

export interface SignInResult {
  success: boolean;
  error?: string;
}

export async function signInWithUsername(
  username: string,
  password: string,
): Promise<SignInResult> {
  const cleanUsername = username.trim();
  if (!cleanUsername) return { success: false, error: 'Enter your username.' };
  if (!password) return { success: false, error: 'Enter your password.' };

  const email = syntheticEmail(cleanUsername);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { success: false, error: 'Invalid username or password. Please try again.' };
  }
  return { success: true };
}

export interface RecoveryResult {
  success: boolean;
  error?: string;
}

// Triggers a password-reset email to the user's recovery email (if set) via
// the service-role edge function. The user only supplies their username.
export async function recoverPasswordByUsername(username: string): Promise<RecoveryResult> {
  const cleanUsername = username.trim();
  if (!cleanUsername) return { success: false, error: 'Enter your username.' };

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account/recover-password`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };

  let res: Response;
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: cleanUsername }),
    });
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore parse error
  }

  if (!res.ok) {
    const msg = (body as { error?: string })?.error || 'Could not send recovery email.';
    return { success: false, error: msg };
  }
  return { success: true };
}

// Change the caller's username. Validates locally, then delegates to the
// service-role edge function which enforces uniqueness server-side.
export interface UpdateUsernameResult {
  success: boolean;
  username?: string;
  error?: string;
}

export async function updateOwnUsername(
  newUsername: string,
): Promise<UpdateUsernameResult> {
  const cleanUsername = newUsername.trim();
  const usernameErr = validateUsername(cleanUsername);
  if (usernameErr) return { success: false, error: usernameErr };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, error: 'You must be signed in.' };

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account/update-username`;
  let res: Response;
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ newUsername: cleanUsername }),
    });
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = (body as { error?: string })?.error || 'Could not update username.';
    return { success: false, error: msg };
  }
  return { success: true, username: (body as { username?: string }).username || cleanUsername };
}
