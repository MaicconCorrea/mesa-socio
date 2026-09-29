import { db } from "@/lib/db";
import { dataHora } from "@/lib/fmt";

export const dynamic = "force-dynamic";

// Últimos eventos que a Evolution mandou (diagnóstico)
export default async function WebhookLog() {
  const { data } = await db().from("webhook_log").select("*").order("id", { ascending: false }).limit(80);
  return (
    <>
      <h1>Eventos do WhatsApp (últimos 80)</h1>
      <p className="muted small">Mostra o que a Evolution está mandando pra Mesa. Sem o texto das mensagens.</p>
      <table>
        <thead><tr><th>Quando</th><th>Evento</th><th>Número</th><th>De mim?</th><th>remoteJid</th><th>Alternativo</th><th>Tipo</th></tr></thead>
        <tbody>
          {(data || []).map(l => (
            <tr key={l.id}>
              <td>{dataHora(l.em)}</td><td>{l.evento}</td><td>{l.instancia}</td>
              <td>{l.resumo?.fromMe ? "✅ sim" : "não"}</td>
              <td style={{ fontSize: 12 }}>{l.resumo?.remoteJid}</td>
              <td style={{ fontSize: 12 }}>{l.resumo?.remoteJidAlt || l.resumo?.senderPn || ""}</td>
              <td style={{ fontSize: 12 }}>{l.resumo?.tipo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
