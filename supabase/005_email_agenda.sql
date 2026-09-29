-- Mesa do Sócio · v0.5 · Gmail e Agenda
create table if not exists email_threads (
  thread_id text primary key,
  assunto text,
  de text,
  de_email text,
  recebido_em timestamptz,
  ultima_msg_id text,
  analisada_msg_id text,
  ultima_minha boolean not null default false,
  automatico boolean not null default false,
  esperando boolean not null default false,
  status text not null default 'nova',
  resumo text,
  ia_erro text,
  atualizado_em timestamptz not null default now()
);
create index if not exists email_threads_esperando_idx on email_threads (esperando, status);
alter table email_threads enable row level security;

alter table tarefas add column if not exists email_thread_id text;
alter table tarefas add column if not exists conflito text;
alter table tarefas add column if not exists evento_id text;
