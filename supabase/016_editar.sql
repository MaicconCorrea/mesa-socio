-- Mesa do Sócio · v0.14.3 · mensagem editada
alter table mensagens add column if not exists editada boolean not null default false;
