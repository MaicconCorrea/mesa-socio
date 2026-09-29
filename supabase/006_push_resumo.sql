-- Mesa do Sócio · v0.6 · notificações push e resumo diário
create table if not exists push_assinaturas (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now()
);
alter table push_assinaturas enable row level security;

-- avisos já enviados (pra não repetir "reunião em 10 min" etc.)
create table if not exists avisos_enviados (
  chave text primary key,
  em timestamptz not null default now()
);
alter table avisos_enviados enable row level security;

-- preferências (liga/desliga avisos, resumo)
create table if not exists config (
  chave text primary key,
  valor jsonb,
  atualizado_em timestamptz not null default now()
);
alter table config enable row level security;
