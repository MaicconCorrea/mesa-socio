import { db } from "@/lib/db";
import { estado, instancias, webhookAtual } from "@/lib/evolution";
import { hojeISO } from "@/lib/fmt";
import { clientIdContaServico, ESCOPOS, googleConfigurado, minhaConta, tokenGoogle } from "@/lib/google";
import { ligarWebhook } from "../actions";
import Avisos from "@/components/Avisos";
import EstiloIA from "@/components/EstiloIA";
import GravadorConfig from "@/components/GravadorConfig";
import EquipeConfig from "@/components/EquipeConfig";
import { lerConfig } from "@/lib/config";
import { motorTranscricao } from "@/lib/transcrever";
import { pushConfigurado } from "@/lib/push";

export const dynamic = "force-dynamic";

export default async function Config({ searchParams }: { searchParams: { msg?: string } }) {
  const insts = await Promise.all(instancias().map(async (i) => ({
    nome: i, estado: await estado(i), webhook: await webhookAtual(i),
  })));

  const testar = async (esc: string) => { try { await tokenGoogle(esc); return "ok"; } catch (e: any) { return String(e?.message ?? e); } };
  const g = googleConfigurado() ? { gmail: await testar(ESCOPOS.gmail), agenda: await testar(ESCOPOS.agenda), drive: await testar(ESCOPOS.drive),
    chat: await testar(ESCOPOS.chatEspacos), diretorio: await testar(ESCOPOS.diretorio), usuarios: await testar(ESCOPOS.usuarios), grupos: await testar(ESCOPOS.grupos) } : null;

  const inicioMes = `${hojeISO().slice(0, 7)}-01T00:00:00-03:00`;
  const { data: uso } = await db().from("ia_uso").select("tokens_in,tokens_out").gte("em", inicioMes);
  const tin = (uso || []).reduce((s, u) => s + u.tokens_in, 0);
  const tout = (uso || []).reduce((s, u) => s + u.tokens_out, 0);
  const custo = (tin * 3 + tout * 15) / 1_000_000; // Sonnet: US$ 3 / 15 por milhão

  const faltando = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY", "EVOLUTION_URL", "EVOLUTION_API_KEY", "WEBHOOK_SECRET", "CRON_SECRET", "GOOGLE_SERVICE_ACCOUNT_JSON", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "ACESSORIAS_TOKEN"]
    .filter((k) => !process.env[k]);

  return (
    <>
      <div className="conteudo">
        <h1>Configuração</h1>
        {searchParams.msg ? <div className="aviso">{searchParams.msg}</div> : null}
        {faltando.length ? <div className="aviso">⚠️ Faltam variáveis na Vercel: <b>{faltando.join(", ")}</b></div> : null}

        <h2>WhatsApp (Evolution)</h2>
        <table>
          <thead><tr><th>Instância</th><th>Conexão</th><th>Webhook</th><th></th></tr></thead>
          <tbody>
            {insts.map((i) => {
              const ligado = i.webhook?.enabled && i.webhook.url.includes("/api/webhook/evolution");
              return (
                <tr key={i.nome}>
                  <td><b>{i.nome}</b></td>
                  <td>{i.estado === "open" ? "🟢 conectada" : `🔴 ${i.estado}`}</td>
                  <td>{ligado ? "🟢 ligado neste painel" : i.webhook?.url ? `🟡 aponta para outro lugar` : "⚪ desligado"}</td>
                  <td>
                    <form action={ligarWebhook}>
                      <input type="hidden" name="instancia" value={i.nome} />
                      <button className="primario">{ligado ? "Religar webhook" : "Ligar webhook"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2>🤖 IA: sugestões, meu jeito de escrever e áudios</h2>
        <EstiloIA motor={motorTranscricao()} />

        <h2>🎙️ Gravador de reuniões (extensão do Chrome)</h2>
        <GravadorConfig temChave={!!((await lerConfig()) as any).chave_gravador} motor={motorTranscricao()} />

        <h2>👥 Reuniões da equipe (extensão para todos os setores)</h2>
        <EquipeConfig extId={process.env.EXT_ID || "eleibeagodmdpokamdpdfneclodahbfp"} clientOk={!!process.env.EXT_OAUTH_CLIENT_ID} comChave={Object.keys(((await lerConfig()) as any).chaves_painel || {})} />

        <h2>🔔 Avisos e resumo do dia</h2>
        {!pushConfigurado() ? <div className="aviso">Faltam <b>VAPID_PUBLIC_KEY</b> e <b>VAPID_PRIVATE_KEY</b> na Vercel — copie as duas do projeto do Painel DP.</div> : <Avisos />}

        <h2>Google (Gmail e Agenda) · {minhaConta()}</h2>
        {!g ? <div className="aviso">Falta <b>GOOGLE_SERVICE_ACCOUNT_JSON</b> na Vercel — copie o valor do projeto do Painel DP.</div> : (
          <table>
            <tbody>
              <tr><td><b>Gmail</b></td><td>{g.gmail === "ok" ? "🟢 funcionando" : `🔴 ${g.gmail}`}</td></tr>
              <tr><td><b>Agenda</b></td><td>{g.agenda === "ok" ? "🟢 funcionando" : `🔴 ${g.agenda}`}</td></tr>
              <tr><td><b>Drive (reuniões)</b></td><td>{g.drive === "ok" ? "🟢 funcionando" : `🔴 ${g.drive}`}</td></tr>
              <tr><td><b>Google Chat</b></td><td>{g.chat === "ok" ? "🟢 autorizado" : `🔴 ${g.chat}`}</td></tr>
              <tr><td><b>Nomes (diretório)</b></td><td>{g.diretorio === "ok" ? "🟢 autorizado" : `🔴 ${g.diretorio}`}</td></tr>
              <tr><td><b>Nomes (usuários do Workspace)</b></td><td>{g.usuarios === "ok" ? "🟢 autorizado" : `🔴 ${g.usuarios} — escopo admin.directory.user.readonly`}</td></tr>
              <tr><td><b>Grupos (setores)</b></td><td>{g.grupos === "ok" ? "🟢 autorizado" : `🔴 ${g.grupos}`}</td></tr>
            </tbody>
          </table>
        )}
        {g && Object.values(g).some(v => v !== "ok") ? (
          <div className="card small" style={{ marginTop: 8 }}>
            <b>Como liberar:</b> admin.google.com → Segurança → Acesso e controle de dados → Controles de API → <b>Delegação em todo o domínio</b> → editar o ID do cliente <code>{clientIdContaServico()}</code> e ACRESCENTAR (sem apagar os que já existem) os escopos que faltam — a lista final precisa conter:
            <pre style={{ whiteSpace: "pre-wrap", background: "var(--paper)", padding: 8, borderRadius: 6 }}>{[ESCOPOS.gmail, ESCOPOS.agenda, ESCOPOS.drive, ESCOPOS.chatEspacos, ESCOPOS.chatMensagens, ESCOPOS.chatMembros, ESCOPOS.diretorio, ESCOPOS.usuarios, ESCOPOS.grupos].join(",")}</pre>
            Se aparecer "Calendar API não está ativa": console.cloud.google.com → projeto da conta de serviço → APIs e serviços → ativar <b>Google Calendar API</b>, <b>Google Drive API</b>, <b>Google Chat API</b> e <b>People API</b>. No Google Chat API, abra a aba <b>Configuração</b> e preencha nome do app "Mesa do Sócio", avatar <code>https://mesa-socio.vercel.app/icone-192.png</code> e uma descrição (é exigência do Google, mesmo sem usar bot).
          </div>
        ) : null}

        <p className="small"><a href="/config/webhook">🔎 Ver os últimos eventos que a Evolution mandou (diagnóstico)</a></p>

        <h2>IA (Claude) — consumo do mês</h2>
        <div className="card">
          {uso?.length || 0} análises · {tin.toLocaleString("pt-BR")} tokens de entrada · {tout.toLocaleString("pt-BR")} de saída ·
          custo estimado <b>US$ {custo.toFixed(2)}</b>
        </div>
      </div>
    </>
  );
}
