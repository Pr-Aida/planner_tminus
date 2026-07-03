import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") as string;

const USERNAME_REGEX = /^[A-Za-z0-9_.]+$/;
const SYNTHETIC_DOMAIN = "username.local";
const MIN_USERNAME = 3;
const MAX_USERNAME = 24;
const MIN_PASSWORD = 6;

interface SignUpBody {
  username?: string;
  password?: string;
  display_name?: string;
}
interface RecoverBody {
  username: string;
}
interface UpdateUsernameBody {
  newUsername: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateUsername(u: string): string | null {
  if (u.length < MIN_USERNAME) return `Username must be at least ${MIN_USERNAME} characters.`;
  if (u.length > MAX_USERNAME) return `Username must be at most ${MAX_USERNAME} characters.`;
  if (!USERNAME_REGEX.test(u)) return "Use only letters, numbers, underscores, and dots.";
  return null;
}

// Create an auth user with a synthetic email (confirmed) and a profile row,
// all server-side. The client then signs in with the returned credentials.
// This keeps signup working even when email confirmation is enabled, since
// synthetic emails cannot receive confirmation links.
async function signUp(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({} as SignUpBody));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";

  const usernameErr = validateUsername(username);
  if (usernameErr) return json({ error: usernameErr }, 400);
  if (password.length < MIN_PASSWORD) {
    return json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Uniqueness check (case-insensitive) before creating the auth user.
  const { data: existing, error: existErr } = await admin
    .from("profiles")
    .select("id")
    .eq("username_lower", username.toLowerCase())
    .maybeSingle();

  if (existErr) {
    return json({ error: "Could not verify username. Please try again." }, 500);
  }
  if (existing) {
    return json({ error: "This username is already taken. Please choose another." }, 409);
  }

  const syntheticEmail = `${username.toLowerCase()}@${SYNTHETIC_DOMAIN}`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName || username },
  });

  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return json({ error: "This username is already taken. Please choose another." }, 409);
    }
    return json({ error: createErr.message || "Could not create account." }, 500);
  }
  if (!created.user) {
    return json({ error: "Could not create account." }, 500);
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    display_name: displayName || username,
  });

  if (profileErr) {
    // Best-effort cleanup of the dangling auth user.
    await admin.auth.admin.deleteUser(created.user.id);
    if (profileErr.message.includes("profiles_username_lower_key")) {
      return json({ error: "This username is already taken. Please choose another." }, 409);
    }
    return json({ error: "Could not finish creating your account. Please try again." }, 500);
  }

  return json({ ok: true }, 201);
}

// Lookup a user's recovery email by username, then trigger a password-reset
// email to that address using the service-role admin API.
async function recoverPassword(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({} as RecoverBody));
  const username = typeof body.username === "string" ? body.username.trim() : "";

  if (!username) {
    return json({ error: "Username is required." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, recovery_email")
    .eq("username_lower", username.toLowerCase())
    .maybeSingle();

  if (pErr) {
    return json({ error: "Lookup failed. Please try again." }, 500);
  }
  if (!profile) {
    return json({ error: "No account found with that username." }, 404);
  }
  if (!profile.recovery_email) {
    return json({
      error: "No recovery email is set for this account. Please contact support.",
    }, 404);
  }

  const redirectTo = `${new URL(req.url).origin}/reset-password`;
  const { error: resetErr } = await admin.auth.admin.generateLink(
    "recovery",
    profile.recovery_email,
    { redirectTo },
  );

  if (resetErr) {
    return json({ error: "Could not send recovery email. Please try again later." }, 500);
  }

  return json({ ok: true, message: "Recovery email sent." }, 200);
}

// Validate and change a username for the authenticated caller.
// Enforces uniqueness (case-insensitive) server-side as the source of truth.
async function updateUsername(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized." }, 401);
  }
  const jwt = authHeader.replace("Bearer ", "");

  const anon = createClient(supabaseUrl, anonKey);
  const { data: userData, error: uErr } = await anon.auth.getUser(jwt);
  if (uErr || !userData.user) {
    return json({ error: "Unauthorized." }, 401);
  }
  const userId = userData.user.id;

  const body = await req.json().catch(() => ({} as UpdateUsernameBody));
  const newUsername = typeof body.newUsername === "string" ? body.newUsername.trim() : "";

  const usernameErr = validateUsername(newUsername);
  if (usernameErr) return json({ error: usernameErr }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Uniqueness check excluding the current user's own row.
  const { data: existing, error: existErr } = await admin
    .from("profiles")
    .select("id")
    .eq("username_lower", newUsername.toLowerCase())
    .neq("id", userId)
    .maybeSingle();

  if (existErr) {
    return json({ error: "Could not verify username. Please try again." }, 500);
  }
  if (existing) {
    return json({ error: "This username is already taken. Please choose another." }, 409);
  }

  const { error: upErr } = await admin
    .from("profiles")
    .update({ username: newUsername, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (upErr) {
    return json({ error: "Could not update username. Please try again." }, 500);
  }

  return json({ ok: true, username: newUsername }, 200);
}

interface DeleteAccountBody {
  confirm?: boolean;
}

// Permanently delete the authenticated caller's account and all their data.
async function deleteAccount(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized." }, 401);
  }
  const jwt = authHeader.replace("Bearer ", "");

  const anon = createClient(supabaseUrl, anonKey);
  const { data: userData, error: uErr } = await anon.auth.getUser(jwt);
  if (uErr || !userData.user) {
    return json({ error: "Unauthorized." }, 401);
  }
  const userId = userData.user.id;

  const body = await req.json().catch(() => ({} as DeleteAccountBody));
  if (!body.confirm) {
    return json({ error: "Deletion not confirmed." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Delete avatar files from storage
  const { data: avatarFiles } = await admin.storage
    .from("avatars")
    .list(userId);
  if (avatarFiles && avatarFiles.length > 0) {
    const paths = avatarFiles.map((f) => `${userId}/${f.name}`);
    await admin.storage.from("avatars").remove(paths);
  }

  // Delete personal document files from storage (user-documents bucket).
  // DB metadata rows are removed by CASCADE when the auth user is deleted.
  const { data: docFiles } = await admin.storage
    .from("user-documents")
    .list(userId);
  if (docFiles && docFiles.length > 0) {
    const docPaths = docFiles.map((f) => `${userId}/${f.name}`);
    await admin.storage.from("user-documents").remove(docPaths);
  }

  // Delete the auth user — CASCADE in DB will remove all owned rows.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return json({ error: "Could not delete account. Please try again." }, 500);
  }

  return json({ ok: true }, 200);
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "");

  try {
    if (path.endsWith("/sign-up") && req.method === "POST") {
      return await signUp(req);
    }
    if (path.endsWith("/recover-password") && req.method === "POST") {
      return await recoverPassword(req);
    }
    if (path.endsWith("/update-username") && req.method === "POST") {
      return await updateUsername(req);
    }
    if (path.endsWith("/delete-account") && req.method === "POST") {
      return await deleteAccount(req);
    }
    return json({ error: "Not found." }, 404);
  } catch (err) {
    return json({ error: (err as Error).message || "Server error." }, 500);
  }
});
