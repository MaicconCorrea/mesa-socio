-- Mesa do Sócio · v0.15.7 · fixar conversas no topo (📌)
alter table conversas add column if not exists fixada_em timestamptz;
