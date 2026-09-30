-- Mesa do Sócio · v0.13.3 · apagar mensagens
alter table mensagens add column if not exists apagada boolean not null default false; -- apagada para todos (no WhatsApp)
alter table mensagens add column if not exists oculta boolean not null default false;  -- "apagar para mim" (some só da Mesa)
