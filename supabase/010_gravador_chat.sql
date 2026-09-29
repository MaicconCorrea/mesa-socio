-- Mesa do Sócio · v0.10 · gravador de reuniões (extensão) e anexos do Google Chat
alter table mensagens add column if not exists midia_ref text;
create table if not exists reuniao_pedacos (
  reuniao_id uuid not null references reunioes(id) on delete cascade,
  n int not null,
  texto text,
  erro text,
  criado_em timestamptz not null default now(),
  primary key (reuniao_id, n)
);
alter table reuniao_pedacos enable row level security;
