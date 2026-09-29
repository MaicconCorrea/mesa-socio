-- Mesa do Sócio · v0.3 · chat (não lidas e mídia)
alter table conversas add column if not exists nao_lidas int not null default 0;
alter table mensagens add column if not exists tipo text;
alter table mensagens add column if not exists midia_mime text;
alter table mensagens add column if not exists midia_nome text;
alter table mensagens add column if not exists tem_midia boolean not null default false;
