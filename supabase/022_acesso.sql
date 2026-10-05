-- Mesa do Sócio · v0.21 · Quem acessa a Mesa
-- A partir da v0.21 só ENTRAM na Mesa:
--   1) os sócios ATIVOS desta tabela `socios` (ativo = true); e
--   2) os administradores da Mesa, definidos na variável MESA_ADMINS da Vercel
--      (lista separada por vírgula; padrão no código: maiccon@outtax.com.br,lucas.teles@outtax.com.br).
-- Qualquer outra conta do Supabase Auth é deslogada e volta para o login com
-- "Seu e-mail não tem acesso à Mesa do Sócio." (também vale para o login vindo do Painel Outtax).
-- Só administradores leem/alteram as configurações GLOBAIS (config com dono = '*': chaves_painel, chave_gravador).
-- Administrador que não é sócio (ex.: Lucas, do desenvolvimento) NÃO deve ser inserido aqui:
-- os crons (e-mail, análise, avisos, resumo) percorrem esta tabela e rodariam a Mesa para ele.

-- garante o Marcos como sócio ativo (mantém o nome se já existir)
insert into socios (email, nome, ativo) values ('marcos@outtax.com.br', 'Marcos', true)
on conflict (email) do update set ativo = true;

-- conferência: sócios cadastrados
select email, nome, ativo, criado_em from socios order by email;
