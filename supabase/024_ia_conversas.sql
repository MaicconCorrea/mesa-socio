-- Mesa do Sócio · v0.22.1 · Conversa com a IA guardada no banco
-- O bloco "Conversar com a IA" (conversa do WhatsApp/Google Chat, e-mail ou tarefa) passa a ficar salvo:
-- trocou de conversa e voltou, o histórico com a IA e as sugestões continuam lá.
-- Um registro por sócio (dono) + item (tipo: chat | email | tarefa; ref_id: id da conversa, do e-mail ou da tarefa).
-- mensagens = lista [{ "papel": "eu" | "ia", "texto": "...", "tipo": "sugestao" | "analise" | "texto", "em": "data" }]
-- Sem este arquivo a Mesa continua funcionando como antes (só não guarda a conversa com a IA).
-- Pode rodar quantas vezes quiser.

create table if not exists ia_conversas (
  id uuid primary key default gen_random_uuid(),
  dono text not null,
  tipo text not null,
  ref_id text not null,
  mensagens jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);
create unique index if not exists ia_conversas_item_uidx on ia_conversas (dono, tipo, ref_id);
alter table ia_conversas enable row level security;

-- acrescenta mensagens no fim (de uma vez só, sem perder nada se duas chegarem juntas)
create or replace function ia_conversa_anexar(p_dono text, p_tipo text, p_ref text, p_msgs jsonb)
returns void language sql as $$
  insert into ia_conversas (dono, tipo, ref_id, mensagens, atualizado_em)
  values (lower(p_dono), p_tipo, p_ref, p_msgs, now())
  on conflict (dono, tipo, ref_id)
  do update set mensagens = ia_conversas.mensagens || excluded.mensagens, atualizado_em = now();
$$;
revoke all on function ia_conversa_anexar(text, text, text, jsonb) from public, anon, authenticated;
