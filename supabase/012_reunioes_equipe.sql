-- Mesa do Sócio · v0.11 · reuniões da equipe (extensão para todos os setores)
alter table reunioes add column if not exists setor text;
alter table reunioes add column if not exists autor_email text;
alter table reunioes add column if not exists autor_nome text;
alter table reunioes add column if not exists tarefas_equipe jsonb;
create index if not exists reunioes_setor_idx on reunioes (setor, data desc);
