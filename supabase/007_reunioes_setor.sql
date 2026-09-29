-- Mesa do Sócio · v0.7 · reuniões (Meet) e mandar pro setor (Acessórias)
create table if not exists empresas (
  cnpj text primary key,
  razao text,
  fantasia text,
  acessorias_id text,
  atualizado_em timestamptz not null default now()
);
alter table empresas enable row level security;

create table if not exists chamados (
  id uuid primary key default gen_random_uuid(),
  sol_id text,
  empresa_cnpj text,
  empresa_nome text,
  departamento text,
  departamento_nome text,
  assunto text,
  descricao text,
  conversa_id uuid,
  email_thread_id text,
  tarefa_id uuid,
  status text not null default 'A',
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz
);
alter table chamados enable row level security;

create table if not exists reunioes (
  id uuid primary key default gen_random_uuid(),
  doc_id text unique,
  titulo text,
  data timestamptz,
  link text,
  origem text not null default 'drive',
  texto text,
  resumo text,
  decisoes jsonb,
  participantes jsonb,
  analisada_em timestamptz,
  ia_erro text,
  criada_em timestamptz not null default now()
);
alter table reunioes enable row level security;

alter table conversas add column if not exists empresa_cnpj text;
alter table tarefas add column if not exists reuniao_id uuid;
alter table tarefas add column if not exists chamado_id uuid;
