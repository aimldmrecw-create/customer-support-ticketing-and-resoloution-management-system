-- Customer Support Ticketing and Resolution Management System
-- Run this file in Supabase Dashboard -> SQL Editor -> New query.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  role text not null default 'customer' check (role in ('customer', 'agent', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text generated always as ('TKT-' || upper(substr(replace(id::text, '-', ''), 1, 8))) stored unique,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  assignee_id uuid references public.profiles(id) on delete set null,
  subject text not null check (char_length(trim(subject)) between 5 and 150),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  category text not null check (category in ('Technical', 'Billing', 'Account', 'General')),
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status text not null default 'Open' check (status in ('Open', 'In Progress', 'Waiting on Customer', 'Resolved', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  message text not null check (char_length(trim(message)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists tickets_customer_id_idx on public.tickets(customer_id);
create index if not exists tickets_assignee_id_idx on public.tickets(assignee_id);
create index if not exists tickets_status_idx on public.tickets(status);
create index if not exists tickets_updated_at_idx on public.tickets(updated_at desc);
create index if not exists ticket_comments_ticket_id_idx on public.ticket_comments(ticket_id, created_at);

create or replace function public.set_ticket_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tickets_updated_at_trigger on public.tickets;
create trigger tickets_updated_at_trigger
before update on public.tickets
for each row execute function public.set_ticket_updated_at();

-- This MVP accesses the database only from the Express server using the service-role key.
-- The service-role key bypasses RLS; backend authorization is therefore mandatory.
-- Enable RLS to block accidental direct client access. No anon/authenticated policies are
-- added because browser-side Supabase access is intentionally not used.
alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;

-- After registering your own account, promote it to admin with this SQL:
-- update public.profiles set role = 'admin' where email = 'your-email@example.com';
-- Never allow users to choose their own role during public registration.
