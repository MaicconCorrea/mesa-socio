-- Mesa do Sócio · SQL completo até a v0.11 (pode rodar quantas vezes quiser)
create extension if not exists pgcrypto;

create table if not exists conversas (
  id uuid primary key default gen_random_uuid(), instancia text not null, jid text not null, nome text,
  is_grupo boolean not null default false, ignorada boolean not null default false,
  ultima_msg_em timestamptz, ultima_msg_de_mim boolean, ultima_msg_texto text,
  pendente_ia boolean not null default false, analisada_em timestamptz, precisa_resposta boolean not null default false,
  resumo text, ia_erro text, criada_em timestamptz not null default now(), unique (instancia, jid)
);
create table if not exists mensagens (
  id uuid primary key default gen_random_uuid(), conversa_id uuid not null references conversas(id) on delete cascade,
  msg_id text not null, de_mim boolean not null default false, autor text, texto text,
  enviada_em timestamptz not null default now(), unique (conversa_id, msg_id)
);
create table if not exists tarefas (
  id uuid primary key default gen_random_uuid(), conversa_id uuid references conversas(id) on delete set null,
  tipo text not null default 'pedido', titulo text not null, detalhe text, quem text, prazo timestamptz,
  status text not null default 'aberta', origem text not null default 'whatsapp', trecho text, hash text unique,
  criada_em timestamptz not null default now(), concluida_em timestamptz
);
create table if not exists ia_uso (
  id bigint generated always as identity primary key, em timestamptz not null default now(),
  conversa_id uuid, tokens_in int not null default 0, tokens_out int not null default 0
);

-- v0.2 a v0.4
alter table conversas add column if not exists modo text not null default 'auto';
alter table conversas add column if not exists sem_retorno boolean not null default false;
alter table conversas add column if not exists checar_parado boolean not null default false;
alter table conversas add column if not exists nao_lidas int not null default 0;
alter table conversas add column if not exists foto_url text;
alter table conversas add column if not exists historico_em timestamptz;
alter table mensagens add column if not exists me_citou boolean not null default false;
alter table mensagens add column if not exists tipo text;
alter table mensagens add column if not exists midia_mime text;
alter table mensagens add column if not exists midia_nome text;
alter table mensagens add column if not exists tem_midia boolean not null default false;
alter table mensagens add column if not exists participante text;
alter table mensagens add column if not exists citada_texto text;
alter table tarefas add column if not exists categoria text not null default 'trabalho';

-- v0.5 e-mail e agenda
create table if not exists email_threads (
  thread_id text primary key, assunto text, de text, de_email text, recebido_em timestamptz,
  ultima_msg_id text, analisada_msg_id text, ultima_minha boolean not null default false,
  automatico boolean not null default false, esperando boolean not null default false,
  status text not null default 'nova', resumo text, ia_erro text, atualizado_em timestamptz not null default now()
);
alter table tarefas add column if not exists email_thread_id text;
alter table tarefas add column if not exists conflito text;
alter table tarefas add column if not exists evento_id text;

-- v0.6 avisos e resumo
create table if not exists push_assinaturas (endpoint text primary key, p256dh text not null, auth text not null, aparelho text, criado_em timestamptz not null default now());
create table if not exists avisos_enviados (chave text primary key, em timestamptz not null default now());
create table if not exists config (chave text primary key, valor jsonb, atualizado_em timestamptz not null default now());

-- v0.7 reuniões e setor
create table if not exists empresas (cnpj text primary key, razao text, fantasia text, acessorias_id text, atualizado_em timestamptz not null default now());
create table if not exists chamados (
  id uuid primary key default gen_random_uuid(), sol_id text, empresa_cnpj text, empresa_nome text,
  departamento text, departamento_nome text, assunto text, descricao text, conversa_id uuid, email_thread_id text,
  tarefa_id uuid, status text not null default 'A', criado_em timestamptz not null default now(), finalizado_em timestamptz
);
create table if not exists reunioes (
  id uuid primary key default gen_random_uuid(), doc_id text unique, titulo text, data timestamptz, link text,
  origem text not null default 'drive', texto text, resumo text, decisoes jsonb, participantes jsonb,
  analisada_em timestamptz, ia_erro text, criada_em timestamptz not null default now()
);
alter table conversas add column if not exists empresa_cnpj text;
alter table tarefas add column if not exists reuniao_id uuid;
alter table tarefas add column if not exists chamado_id uuid;

-- v0.8 sugestão, áudio, LID
alter table mensagens add column if not exists transcricao text;
alter table mensagens add column if not exists transcricao_erro text;
alter table conversas add column if not exists sugestao text;
alter table conversas add column if not exists sugestao_em timestamptz;
alter table conversas add column if not exists lid text;
create table if not exists webhook_log (id bigint generated always as identity primary key, em timestamptz not null default now(), evento text, instancia text, resumo jsonb);

-- v0.10 gravador e anexos do Chat
alter table mensagens add column if not exists midia_ref text;
create table if not exists reuniao_pedacos (
  reuniao_id uuid not null references reunioes(id) on delete cascade, n int not null, texto text, erro text,
  criado_em timestamptz not null default now(), primary key (reuniao_id, n)
);
alter table email_threads add column if not exists ia_dispensou text;

-- regras
alter table conversas drop constraint if exists conversas_modo_chk;
alter table conversas add constraint conversas_modo_chk check (modo in ('auto','pessoal','grupo','ignorada'));
alter table tarefas drop constraint if exists tarefas_tipo_chk;
alter table tarefas add constraint tarefas_tipo_chk check (tipo in ('pedido','promessa','reuniao','outro'));
alter table tarefas drop constraint if exists tarefas_status_chk;
alter table tarefas add constraint tarefas_status_chk check (status in ('aberta','feita','descartada'));
alter table tarefas drop constraint if exists tarefas_categoria_chk;
alter table tarefas add constraint tarefas_categoria_chk check (categoria in ('trabalho','pessoal'));

-- índices
create index if not exists conversas_ultima_idx on conversas (ultima_msg_em desc);
create index if not exists conversas_pendente_idx on conversas (pendente_ia);
create index if not exists conversas_parado_idx on conversas (checar_parado);
create index if not exists conversas_lid_idx on conversas (instancia, lid);
create index if not exists mensagens_conversa_idx on mensagens (conversa_id, enviada_em desc);
create index if not exists tarefas_status_idx on tarefas (status, prazo);
create index if not exists email_threads_esperando_idx on email_threads (esperando, status);

-- segurança: ninguém de fora lê nada (a Mesa acessa pelo servidor)
alter table conversas enable row level security;
alter table mensagens enable row level security;
alter table tarefas enable row level security;
alter table ia_uso enable row level security;
alter table email_threads enable row level security;
alter table push_assinaturas enable row level security;
alter table avisos_enviados enable row level security;
alter table config enable row level security;
alter table empresas enable row level security;
alter table chamados enable row level security;
alter table reunioes enable row level security;
alter table webhook_log enable row level security;
alter table reuniao_pedacos enable row level security;
alter table reunioes add column if not exists setor text;
alter table reunioes add column if not exists autor_email text;
alter table reunioes add column if not exists autor_nome text;
alter table reunioes add column if not exists tarefas_equipe jsonb;
create index if not exists reunioes_setor_idx on reunioes (setor, data desc);
