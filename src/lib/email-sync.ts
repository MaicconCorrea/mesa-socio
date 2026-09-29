// Mantém a tabela email_threads em dia (quem está esperando resposta) e manda os e-mails novos pra IA
import { db } from "./db";
import { listarThreads, type ResumoThread } from "./gmail";
import { minhaConta } from "./google";
import { analisarEmail } from "./analise";
import { lerConfig } from "./config";
import { avisarUmaVez, notificar } from "./push";

export async function registrarThread(t: ResumoThread) {
  const sb = db();
  const { data: ja } = await sb.from("email_threads").select("status,ultima_msg_id").eq("thread_id", t.id).maybeSingle();
  const mudou = !ja || ja.ultima_msg_id !== t.ultimaMsgId;
  const esperando = !t.ultimaMinha && !t.automatico;
  let status = ja?.status ?? "nova";
  if (t.ultimaMinha) status = "tratada";            // você respondeu
  else if (mudou && ja && ja.status !== "ignorada") status = "nova"; // chegou coisa nova
  await sb.from("email_threads").upsert({
    thread_id: t.id, assunto: t.assunto, de: t.de, de_email: t.deEmail, recebido_em: t.quando,
    ultima_msg_id: t.ultimaMsgId, ultima_minha: t.ultimaMinha, automatico: t.automatico,
    esperando, status, atualizado_em: new Date().toISOString(),
  }, { onConflict: "thread_id" });
  // 🔔 e-mail novo de pessoa (só se chegou há pouco — a primeira sincronização não dispara avisos antigos)
  if (mudou && esperando && t.ultimaDeFora && Date.now() - new Date(t.ultimaDeFora).getTime() < 30 * 60000) {
    try {
      const cfg = await lerConfig();
      if (cfg.push_email) await avisarUmaVez(`email|${t.ultimaMsgId}`, () => notificar(`✉️ ${t.de}`, `${t.assunto} — ${t.snippet}`, `/email?thread=${t.id}`, `em-${t.id}`));
    } catch { /* segue */ }
  }
}

export async function sincronizarEmail(analisarAte = 5) {
  const conta = minhaConta();
  const { threads } = await listarThreads(conta, "in:inbox newer_than:3d -category:promotions -category:social", undefined, 40);
  const { threads: enviados } = await listarThreads(conta, "in:sent newer_than:2d", undefined, 15);
  const todos = new Map([...threads, ...enviados].map(t => [t.id, t]));
  for (const t of todos.values()) await registrarThread(t);

  // IA: e-mails de gente (não robô) que mudaram desde a última análise
  const sb = db();
  const { data: fila } = await sb.from("email_threads").select("thread_id,ultima_msg_id,analisada_msg_id")
    .eq("automatico", false).neq("status", "ignorada").gte("recebido_em", new Date(Date.now() - 3 * 86400000).toISOString())
    .order("recebido_em", { ascending: false }).limit(40);
  let analisados = 0, tarefas = 0;
  for (const f of (fila || []).filter(f => f.ultima_msg_id && f.ultima_msg_id !== f.analisada_msg_id).slice(0, analisarAte)) {
    try { const r = await analisarEmail(f.thread_id); analisados++; tarefas += r.criadas; }
    catch (e: any) {
      await sb.from("email_threads").update({ analisada_msg_id: f.ultima_msg_id, ia_erro: String(e?.message ?? e).slice(0, 300) }).eq("thread_id", f.thread_id);
      if (String(e?.message).includes("ANTHROPIC_API_KEY")) break;
    }
  }
  return { threads: todos.size, analisados, tarefas };
}
