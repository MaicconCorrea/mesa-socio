import Topo from "@/components/Topo";
import { db } from "@/lib/db";
import { estado, instancias, webhookAtual } from "@/lib/evolution";
import { hojeISO } from "@/lib/fmt";
import { ligarWebhook } from "../actions";

export const dynamic = "force-dynamic";

export default async function Config({ searchParams }: { searchParams: { msg?: string } }) {
  const insts = await Promise.all(instancias().map(async (i) => ({
    nome: i, estado: await estado(i), webhook: await webhookAtual(i),
  })));

  const inicioMes = `${hojeISO().slice(0, 7)}-01T00:00:00-03:00`;
  const { data: uso } = await db().from("ia_uso").select("tokens_in,tokens_out").gte("em", inicioMes);
  const tin = (uso || []).reduce((s, u) => s + u.tokens_in, 0);
  const tout = (uso || []).reduce((s, u) => s + u.tokens_out, 0);
  const custo = (tin * 3 + tout * 15) / 1_000_000; // Sonnet: US$ 3 / 15 por milhão

  const faltando = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY", "EVOLUTION_URL", "EVOLUTION_API_KEY", "WEBHOOK_SECRET", "CRON_SECRET"]
    .filter((k) => !process.env[k]);

  return (
    <>
      <Topo />
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

        <h2>IA (Claude) — consumo do mês</h2>
        <div className="card">
          {uso?.length || 0} análises · {tin.toLocaleString("pt-BR")} tokens de entrada · {tout.toLocaleString("pt-BR")} de saída ·
          custo estimado <b>US$ {custo.toFixed(2)}</b>
        </div>
      </div>
    </>
  );
}
