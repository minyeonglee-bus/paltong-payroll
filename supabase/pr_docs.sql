-- 직원 서류 (사장님 2026-11-05): COE·계약서 등 PDF/이미지를 직원별로 보관 — 사장님만 보기/올리기/삭제
-- Safe to run more than once. 파일은 data URL(base64)로 저장, 1개당 최대 약 8MB.
create table if not exists public.pr_docs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  title text not null,
  file_name text,
  mime text not null,
  size int not null default 0,
  data text not null,
  created_at timestamptz not null default now(),
  constraint pr_docs_size_chk check (length(data) <= 11500000),
  constraint pr_docs_mime_chk check (mime in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp'))
);
create index if not exists pr_docs_emp_idx on public.pr_docs(employee_id, created_at desc);
alter table public.pr_docs enable row level security;
drop policy if exists pr_docs_owner on public.pr_docs;
create policy pr_docs_owner on public.pr_docs for all using (public.is_owner()) with check (public.is_owner());
