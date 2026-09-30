-- Mesa do Sócio · v0.15.1 · tirar conversa de "esperando você" sem a IA remarcar
alter table conversas add column if not exists esperando_dispensado_em timestamptz;
