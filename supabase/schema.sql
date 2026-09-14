-- Выполните этот скрипт в Supabase: SQL Editor -> New query -> вставить -> Run

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  full_name text not null,
  email text not null,
  organization text,
  city text,
  country text,
  degree text,
  article_title text not null,
  section text,
  phone text,
  article_path text,
  application_path text,
  check_passed boolean,
  check_summary text,
  status text default 'pending'
);

-- Хранилище для файлов (создайте бакет "papers" в разделе Storage вручную,
-- либо выполните это, если поддерживается вашим проектом):
-- insert into storage.buckets (id, name, public) values ('papers', 'papers', false);
