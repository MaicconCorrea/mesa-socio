# Mesa do Sócio · Outtax

Painel pessoal do Maiccon: WhatsApp (via Evolution), tarefas automáticas pela IA e, nas próximas versões, Google Agenda, Gmail, Google Chat e resumos de reunião.

Variáveis na Vercel: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, EVOLUTION_URL, EVOLUTION_API_KEY, WEBHOOK_SECRET, CRON_SECRET (opcionais: EVOLUTION_INSTANCIAS, ANTHROPIC_MODEL, ANTHROPIC_MODEL_LEVE, HORAS_GRUPO_PARADO).

## Quem acessa a Mesa (v0.21)

Entram na Mesa só:

- os **sócios ativos** da tabela `socios` (`ativo = true`) — cada um vê a própria Mesa e as próprias configurações;
- os **administradores da Mesa**: variável `MESA_ADMINS` na Vercel (e-mails separados por vírgula). Sem a variável, vale o padrão do código: `maiccon@outtax.com.br,lucas.teles@outtax.com.br`.

Qualquer outra conta do Supabase Auth é deslogada e volta ao login com "Seu e-mail não tem acesso à Mesa do Sócio." (inclusive pelo login único do Painel Outtax). Só administradores veem e alteram as **chaves globais** (Gravador de reuniões e chaves dos painéis de setor, em Configuração); para os demais esses blocos não aparecem e o servidor responde 403.

Administrador que não é sócio (ex.: time de desenvolvimento) **não** deve ser colocado em `socios` — os crons percorrem essa tabela.

Como dar acesso a um administrador: (1) acrescente o e-mail em `MESA_ADMINS` na Vercel e faça um novo deploy; (2) crie o usuário no Supabase → Authentication → Users → **Add user** (com senha) ou **Invite**. Para um novo sócio: crie o usuário no Auth e insira a linha em `socios` (`ativo = true`). Rode `supabase/022_acesso.sql` (garante o Marcos ativo).

## Contatos (v0.20)

Tela /contatos: salva em lote os números das conversas na Mesa, no Google Contatos (o celular sincroniza e o WhatsApp mostra o nome; rótulo `Outtax · Categoria`) e no Digisac (conexão Atendimento ou BPO, escolhida por contato). Rode `supabase/021_contatos_categoria.sql`.

Variáveis na Vercel:

- `DIGISAC_BASE_URL` (ex.: `https://outtax.digisac.me/api/v1`) e `DIGISAC_TOKEN` — as mesmas da Célula de Entrada. Sem elas a coluna Digisac fica "não configurado" e o cadastro no Digisac fica desativado.
- `DIGISAC_SERVICE_ATENDIMENTO` e `DIGISAC_SERVICE_BPO` (opcionais) — id das conexões. Sem elas a Mesa procura em `/services` as conexões cujo nome tem "Atendimento" ou "BPO".
- Google: a conta de serviço (`GOOGLE_SERVICE_ACCOUNT_JSON`) precisa do escopo `https://www.googleapis.com/auth/contacts` na delegação em todo o domínio (admin.google.com).
