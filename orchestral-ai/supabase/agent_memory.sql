-- Agent memory store for Orchestral AI
-- Run in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.agent_error_memory (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  session_id text null,
  agent_id text not null,
  agent_name text not null,
  task_id text null,
  task_name text null,
  stage text not null check (stage in ('execution', 'deployment', 'commit')),
  error_type text not null,
  error_signature text not null,
  error_message text not null,
  remediation text null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_error_memory_project_agent_created
  on public.agent_error_memory (project_name, agent_id, created_at desc);

create index if not exists idx_agent_error_memory_error_type
  on public.agent_error_memory (error_type, created_at desc);

-- Optional: tighten read/write with RLS if you query this table from browser.
-- Server routes here use service-role key, so RLS is bypassed.
