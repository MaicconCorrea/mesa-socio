-- Mesa do Sócio · v0.8.1 · mensagens enviadas pelo celular (LID) e registro do webhook
alter table conversas add column if not exists lid text;
create index if not exists conversas_lid_idx on conversas (instancia, lid);
create table if not exists webhook_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  evento text,
  instancia text,
  resumo jsonb
);
alter table webhook_log enable row level security;
