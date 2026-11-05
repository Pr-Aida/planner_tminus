/*
# Move pg_net extension out of the public schema

## Purpose
The Supabase Security Advisor reports "Extension in Public" for pg_net:
extensions installed in the `public` schema expose their objects to the Data
API surface and are considered a hygiene/security warning. This migration
relocates pg_net to a dedicated `extensions` schema using the official
Supabase-recommended method.

## Pre-flight verification (done before applying)
- pg_net v0.20.3 was installed in the `public` schema.
- Its functions (http_get, http_post, etc.) live in pg_net's own `net` schema,
  not in `public`; no user objects in `public` belong to the extension.
- No database functions reference `net.http_get`, `net.http_post`, or any
  `net.*` function.
- No `supabase_functions` schema exists (no Database Webhooks depend on
  pg_net).
- The only pg_cron job (`cleanup_old_feedback_job`) calls
  `public.cleanup_old_feedback()`, which does NOT reference pg_net.
- No objects depend on any `net.*` function (pg_depend check returned empty).

## Why drop + recreate instead of ALTER EXTENSION SET SCHEMA
pg_net is non-relocatable, so `ALTER EXTENSION pg_net SET SCHEMA extensions`
is not supported. The supported method is:

  create schema if not exists extensions;
  drop extension pg_net;
  create extension pg_net with schema extensions;

## Changes
1. Create the `extensions` schema if it does not already exist.
2. Drop the `pg_net` extension (currently in `public`).
3. Recreate `pg_net` in the `extensions` schema.

## Safety
- No user data is touched: planner data, reminders, activities, habits,
  classes, Study Rooms, auth, profiles, feedback, and the existing cron job
  are all unaffected.
- No other extension is modified.
- The `extensions` schema is a standard Supabase-recommended location for
  non-relocatable extensions and does not interfere with any existing object.
- Recreating pg_net restores its `net.*` functions identically, so any future
  code that calls `net.http_get`/`net.http_post` continues to work unchanged.
*/
CREATE SCHEMA IF NOT EXISTS extensions;

DROP EXTENSION IF EXISTS pg_net;

CREATE EXTENSION pg_net WITH SCHEMA extensions;
