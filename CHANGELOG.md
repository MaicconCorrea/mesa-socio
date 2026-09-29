# Histórico de versões — Mesa do Sócio (Outtax)

| Versão | Data | O que mudou | Migração SQL |
|---|---|---|---|
| v0.1 | 29/09/2026 | Projeto inicial: login, webhook Evolution (socio-1200 e socio-3710), IA caçadora de pedidos/promessas/reuniões (cron 2 min), tela Hoje, Conversas, ignorar contatos, Configuração (ligar webhook, consumo IA) | 001_schema.sql |
| v0.2 | 29/09/2026 | Modos por conversa: 👥 Grupo do escritório (só quando citam o Maiccon + alerta de grupo sem retorno do time há 4h), 🤖 Automático (separa trabalho/pessoal), 🏠 Pessoal (compromissos particulares), 🚫 Ignorar. Detecção de menção/resposta/nome. Abas Tudo/Trabalho/Pessoal na tela Hoje. Checagem de grupo parado com modelo leve (Haiku) | 002_modos.sql |
