-- Mesa do Sócio · v0.10.1 · IA tira da lista e-mail que não precisa de resposta
alter table email_threads add column if not exists ia_dispensou text;
