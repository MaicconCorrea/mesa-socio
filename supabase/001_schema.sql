-- Mesa do Sócio · v0.1 · schema inicial
-- Rodar no Supabase: SQL Editor → New query → colar tudo → Run

create extension if not exists pgcrypto;

-- Conversas do WhatsApp (1 por contato ou grupo, por número)
create table if not exists conversas (
  id                uuid primary key default gen_random_uuid(),
  instancia         text not null,              -- socio-1200 / socio-3710
  jid               text not null,              -- 5521...@s.whatsapp.net ou ...@g.us
  nome              text,
  is_grupo          boolean not null default false,
  ignorada          boolean not null default false,
  ultima_msg_em     timestamptz,
  ultima_msg_de_mim boolean,
  ultima_msg_texto  text,
  pendente_ia       boolean not null default false,
  analisada_em      timestamptz,
  precisa_resposta  boolean not null default false,
  resumo            text,
  ia_erro           text,
  criada_em         timestamptz not null default now(),
  unique (instancia, jid)
);
create index if not exists conversas_ultima_idx on conversas (ultima_msg_em desc);
create index if not exists conversas_pendente_idx on conversas (pendente_ia) where pendente_ia;

-- Mensagens (só texto/legenda; arquivos ficam só como marcador)
create table if not exists mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id) on delete cascade,
  msg_id      text not null,
  de_mim      boolean not null default false,
  autor       text,
  texto       text,
  enviada_em  timestamptz not null default now(),
  unique (conversa_id, msg_id)
);
create index if not exists mensagens_conversa_idx on mensagens (conversa_id, enviada_em desc);

-- Tarefas (pedidos, promessas, reuniões) — criadas pela IA ou à mão
create table if not exists tarefas (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid references conversas(id) on delete set null,
  tipo        text not null default 'pedido' check (tipo in ('pedido','promessa','reuniao','outro')),
  titulo      text not null,
  detalhe     text,
  quem        text,
  prazo       timestamptz,
  status      text not null default 'aberta' check (status in ('aberta','feita','descartada')),
  origem      text not null default 'whatsapp',
  trecho      text,
  hash        text unique,
  criada_em   timestamptz not null default now(),
  concluida_em timestamptz
);
create index if not exists tarefas_status_idx on tarefas (status, prazo);

-- Consumo da IA
create table if not exists ia_uso (
  id         bigint generated always as identity primary key,
  em         timestamptz not null default now(),
  conversa_id uuid,
  tokens_in  int not null default 0,
  tokens_out int not null default 0
);

-- Segurança: ninguém de fora lê nada. O painel acessa pelo servidor (service_role).
alter table conversas enable row level security;
alter table mensagens enable row level security;
alter table tarefas   enable row level security;
alter table ia_uso    enable row level security;
