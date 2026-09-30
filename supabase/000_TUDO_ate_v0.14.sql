-- Mesa do Sócio · SQL completo até a v0.13 (pode rodar quantas vezes quiser)
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

-- ===== v0.13 · sócios =====
-- Tudo o que já existe fica do Maiccon.

create table if not exists socios (
  email text primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
insert into socios (email, nome) values
  ('maiccon@outtax.com.br', 'Maiccon Correa'),
  ('marcos@outtax.com.br', 'Marcos Xavier')
on conflict (email) do nothing;
alter table socios enable row level security;

-- números de WhatsApp de cada sócio (cada um cadastra os seus)
create table if not exists numeros (
  instancia text primary key,
  dono text not null,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
insert into numeros (instancia, dono, nome) values
  ('socio-1200', 'maiccon@outtax.com.br', '1200'),
  ('socio-3710', 'maiccon@outtax.com.br', '3710')
on conflict (instancia) do nothing;
alter table numeros enable row level security;

-- dono em tudo que é pessoal
alter table conversas add column if not exists dono text;
alter table tarefas add column if not exists dono text;
alter table email_threads add column if not exists dono text;
alter table chamados add column if not exists dono text;
alter table ia_uso add column if not exists dono text;
alter table push_assinaturas add column if not exists dono text;
alter table avisos_enviados add column if not exists dono text;
alter table reunioes add column if not exists dono text;

update conversas set dono = 'maiccon@outtax.com.br' where dono is null;
update tarefas set dono = 'maiccon@outtax.com.br' where dono is null;
update email_threads set dono = 'maiccon@outtax.com.br' where dono is null;
update chamados set dono = 'maiccon@outtax.com.br' where dono is null;
update ia_uso set dono = 'maiccon@outtax.com.br' where dono is null;
update push_assinaturas set dono = 'maiccon@outtax.com.br' where dono is null;
update avisos_enviados set dono = 'maiccon@outtax.com.br' where dono is null;
update reunioes set dono = 'maiccon@outtax.com.br' where dono is null and (setor is null or setor = 'SOCIOS');

-- a mesma conversa pode existir para os dois sócios (ex.: um espaço do Google Chat em comum)
alter table conversas drop constraint if exists conversas_instancia_jid_key;
create unique index if not exists conversas_dono_inst_jid on conversas (dono, instancia, jid);

create index if not exists conversas_dono_idx on conversas (dono, ultima_msg_em desc);
create index if not exists tarefas_dono_idx on tarefas (dono, status);
create index if not exists email_threads_dono_idx on email_threads (dono, esperando, status);

-- configurações: por sócio ("*" = do escritório, vale para todos)
alter table config add column if not exists dono text not null default '*';
update config set dono = 'maiccon@outtax.com.br' where dono = '*' and chave not in ('chaves_painel', 'chave_gravador');
alter table config drop constraint if exists config_pkey;
alter table config add primary key (dono, chave);

-- mensagens também têm dono (proteção extra: ninguém lê mensagem de conversa que não é sua)
alter table mensagens add column if not exists dono text;
update mensagens m set dono = c.dono from conversas c where c.id = m.conversa_id and m.dono is null;
create index if not exists mensagens_dono_conv_idx on mensagens (dono, conversa_id, enviada_em desc);
-- Mesa do Sócio · v0.13.3 · apagar mensagens
alter table mensagens add column if not exists apagada boolean not null default false; -- apagada para todos (no WhatsApp)
alter table mensagens add column if not exists oculta boolean not null default false;  -- "apagar para mim" (some só da Mesa)

-- v0.13.5 · varredura rápida (procura mensagens pelo id do WhatsApp)
create index if not exists mensagens_dono_msgid_idx on mensagens (dono, msg_id);
-- Mesa do Sócio · v0.14 · documentos anexados às tarefas (para a IA ler e gerar documentos)
insert into storage.buckets (id, name, public, file_size_limit)
values ('mesa-docs', 'mesa-docs', false, 52428800)
on conflict (id) do nothing;

create table if not exists tarefa_docs (
  id uuid primary key default gen_random_uuid(),
  dono text,
  tarefa_id uuid references tarefas(id) on delete cascade,
  nome text not null,
  mime text,
  caminho text not null,
  tamanho int,
  criado_em timestamptz not null default now()
);
create index if not exists tarefa_docs_tarefa_idx on tarefa_docs (dono, tarefa_id);
alter table tarefa_docs enable row level security;
