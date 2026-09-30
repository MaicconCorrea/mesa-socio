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
