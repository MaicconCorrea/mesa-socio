-- Mesa do Sócio · v0.20 · Contatos: categoria do contato salvo pela Mesa (Cliente, Fornecedor, Equipe, Pessoal, Outro)
-- (opcional: sem esta coluna a Mesa salva o contato sem a categoria; Google e Digisac não dependem dela)
alter table contatos add column if not exists categoria text;
create index if not exists contatos_dono_idx on contatos (dono, numero);
