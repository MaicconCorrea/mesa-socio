-- Mesa do Sócio · v0.8 · sugestão de resposta, transcrição de áudio
alter table mensagens add column if not exists transcricao text;
alter table mensagens add column if not exists transcricao_erro text;
alter table conversas add column if not exists sugestao text;
alter table conversas add column if not exists sugestao_em timestamptz;
create index if not exists mensagens_audio_idx on mensagens (tipo) where tipo = 'audio' and transcricao is null;
