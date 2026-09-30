-- Mesa do Sócio · v0.13 · vários sócios (cada um vê só o que é dele)
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
