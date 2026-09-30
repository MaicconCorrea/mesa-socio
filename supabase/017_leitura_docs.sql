-- Mesa do Sócio · v0.14.4 · leitura dos documentos anexados (texto guardado, situação da leitura)
alter table tarefa_docs add column if not exists texto text;
alter table tarefa_docs add column if not exists status text;   -- lendo | lido | erro
alter table tarefa_docs add column if not exists paginas int;
alter table tarefa_docs add column if not exists erro text;
