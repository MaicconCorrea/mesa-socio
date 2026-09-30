-- Mesa do Sócio · v0.15 · contatos criados na Mesa + quem conduziu a reunião + limpeza do "esperando você" do Marcos

-- 1) Contatos criados pelo botão "Criar contato" (cada sócio tem os seus)
create table if not exists contatos (
  id uuid primary key default gen_random_uuid(),
  dono text not null,
  numero text not null,
  nome text not null,
  criado_em timestamptz not null default now(),
  unique (dono, numero)
);
alter table contatos enable row level security;

-- 2) Reunião: quem conduziu/falou (a gravação não sabe de quem é a voz)
alter table reunioes add column if not exists conduzida_por text;

-- 3) Mesa do Marcos: desfaz marcações que eram pro Maiccon (bug do nome fixo)
update mensagens set me_citou = false
where dono = 'marcos@outtax.com.br' and me_citou = true
  and texto ~* 'mai+c+o+[nm]' and texto !~* 'marcos';
update conversas set precisa_resposta = false
where dono = 'marcos@outtax.com.br' and precisa_resposta = true;
