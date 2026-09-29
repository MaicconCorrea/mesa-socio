-- Mesa do Sócio · v0.4 · WhatsApp completo
alter table conversas add column if not exists foto_url text;
alter table conversas add column if not exists historico_em timestamptz;
alter table mensagens add column if not exists participante text;
alter table mensagens add column if not exists citada_texto text;
