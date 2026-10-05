-- Mesa do Sócio · v0.22 · Pesquisa na tela Hoje (OPCIONAL)
-- A pesquisa funciona sem este arquivo. Ele só deixa a busca rápida quando as tabelas crescerem:
-- índices de trigramas aceleram o "ilike '%termo%'" usado em tarefas, e-mails, conversas e mensagens.
-- Pode rodar quantas vezes quiser (tudo "if not exists"). A criação do índice de mensagens pode levar
-- alguns segundos se houver muitas mensagens.

create extension if not exists pg_trgm;

create index if not exists tarefas_busca_titulo_trgm   on tarefas       using gin (titulo gin_trgm_ops);
create index if not exists tarefas_busca_detalhe_trgm  on tarefas       using gin (detalhe gin_trgm_ops);
create index if not exists tarefas_busca_quem_trgm     on tarefas       using gin (quem gin_trgm_ops);
create index if not exists tarefas_busca_trecho_trgm   on tarefas       using gin (trecho gin_trgm_ops);
create index if not exists email_busca_assunto_trgm    on email_threads using gin (assunto gin_trgm_ops);
create index if not exists email_busca_de_trgm         on email_threads using gin (de gin_trgm_ops);
create index if not exists email_busca_resumo_trgm     on email_threads using gin (resumo gin_trgm_ops);
create index if not exists conversas_busca_nome_trgm   on conversas     using gin (nome gin_trgm_ops);
create index if not exists mensagens_busca_texto_trgm  on mensagens     using gin (texto gin_trgm_ops);

-- índices por dono (a busca sempre filtra pelo sócio logado)
create index if not exists tarefas_dono_criada_idx  on tarefas (dono, criada_em desc);
create index if not exists email_dono_recebido_idx  on email_threads (dono, recebido_em desc);
