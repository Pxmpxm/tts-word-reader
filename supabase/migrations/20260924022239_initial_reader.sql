create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 255),
  source_type text not null check (source_type in ('docx', 'text', 'markdown', 'mineru')),
  status text not null default 'uploading' check (status in ('uploading', 'queued', 'processing', 'saving', 'ready', 'failed')),
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  source_path text not null,
  html text,
  markdown text,
  mineru_json jsonb,
  reading_index integer not null default 0 check (reading_index >= 0),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_updated_idx on public.documents (user_id, updated_at desc);

create table public.document_assets (
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  primary key (document_id, path)
);
create index document_assets_user_idx on public.document_assets (user_id);

create table public.parse_jobs (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mineru_id text unique,
  callback_token text not null unique,
  state text not null default 'queued' check (state in ('queued', 'processing', 'saving', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index parse_jobs_user_idx on public.parse_jobs (user_id);

create table public.audio_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  cache_key text not null,
  storage_path text not null,
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (user_id, document_id, cache_key)
);
create index audio_cache_document_idx on public.audio_cache (document_id);
create index audio_cache_oldest_idx on public.audio_cache (last_used_at);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  voice text not null default 'zh-CN-XiaoxiaoNeural',
  style text not null default 'general',
  playback_rate numeric(2,1) not null default 1.0 check (playback_rate between 0.5 and 2.0)
);

create table public.heartbeats (
  id integer primary key check (id = 1),
  pinged_at timestamptz not null
);

alter table public.documents enable row level security;
alter table public.document_assets enable row level security;
alter table public.parse_jobs enable row level security;
alter table public.audio_cache enable row level security;
alter table public.user_settings enable row level security;
alter table public.heartbeats enable row level security;

revoke all on public.documents, public.document_assets, public.parse_jobs, public.audio_cache, public.user_settings, public.heartbeats from anon, authenticated;
grant select on public.documents, public.document_assets, public.parse_jobs, public.audio_cache, public.user_settings to authenticated;
grant update (reading_index) on public.documents to authenticated;
grant insert, update on public.user_settings to authenticated;

create policy "read own documents" on public.documents for select to authenticated using ((select auth.uid()) = user_id);
create policy "update own reading position" on public.documents for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "read own assets" on public.document_assets for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own jobs" on public.parse_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own audio cache" on public.audio_cache for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own settings" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own settings" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own settings" on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800), ('audio', 'audio', false, 52428800)
on conflict (id) do nothing;

create policy "upload own documents" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(objects.name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.documents d
      where d.id::text = (storage.foldername(objects.name))[2]
        and d.user_id = (select auth.uid())
        and d.source_path = objects.name
        and d.status in ('uploading', 'failed')
    )
  );
create policy "read own document files" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(objects.name))[1] = (select auth.uid())::text);

create policy "replace own source file" on storage.objects for update to authenticated
  using (
    bucket_id = 'documents' and exists (
      select 1 from public.documents d
      where d.user_id = (select auth.uid())
        and d.source_path = objects.name
        and d.status in ('uploading', 'failed')
    )
  )
  with check (
    bucket_id = 'documents' and exists (
      select 1 from public.documents d
      where d.user_id = (select auth.uid())
        and d.source_path = objects.name
        and d.status in ('uploading', 'failed')
    )
  );
