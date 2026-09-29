-- Mesa do Sócio · v0.2 · modos por conversa (grupo do escritório / automático / pessoal / ignorada)
-- Pode rodar mais de uma vez sem problema.

alter table conversas add column if not exists modo text not null default 'auto';
alter table conversas add column if not exists sem_retorno boolean not null default false;
alter table conversas add column if not exists checar_parado boolean not null default false;

update conversas set modo = case
  when ignorada then 'ignorada'
  when is_grupo then 'grupo'
  else 'auto' end
where modo = 'auto';

alter table conversas drop constraint if exists conversas_modo_chk;
alter table conversas add constraint conversas_modo_chk check (modo in ('auto','pessoal','grupo','ignorada'));

create index if not exists conversas_parado_idx on conversas (checar_parado) where checar_parado;

alter table mensagens add column if not exists me_citou boolean not null default false;

alter table tarefas add column if not exists categoria text not null default 'trabalho';
alter table tarefas drop constraint if exists tarefas_categoria_chk;
alter table tarefas add constraint tarefas_categoria_chk check (categoria in ('trabalho','pessoal'));
