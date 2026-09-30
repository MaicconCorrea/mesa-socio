// Acompanha os chamados que o Maiccon delegou: quando o setor finaliza, avisa
import { db } from "./db";
import { acessoriasConfigurado, buscarSolicitacao } from "./acessorias";
import { notificar } from "./push";
import { comDono } from "./contexto";

export async function checarChamados() {
  if (!acessoriasConfigurado()) return { conferidos: 0, finalizados: 0 };
  const sb = db();
  const { data: abertos } = await sb.from("chamados").select("*").neq("status", "F").order("criado_em").limit(40);
  let finalizados = 0;
  for (const c of abertos || []) {
    const s = await buscarSolicitacao(c.sol_id).catch(() => null);
    if (!s) continue;
    // A=Nova, P=Resolvendo, C=Com o cliente, F=Finalizada
    const st = s.SolEncerrada === "S" ? "F" : String(s.SolStatus || c.status).slice(0, 1).toUpperCase();
    if (st && st !== c.status) {
      await sb.from("chamados").update({ status: st, ...(st === "F" ? { finalizado_em: new Date().toISOString() } : {}) }).eq("id", c.id);
      if (st === "F") {
        finalizados++;
        if (c.tarefa_id) await sb.from("tarefas").update({ status: "feita", concluida_em: new Date().toISOString() }).eq("id", c.tarefa_id).eq("status", "aberta");
        if (c.dono) await comDono(c.dono, () => notificar(`✅ ${c.departamento_nome || "Setor"} finalizou`, `${c.assunto} — ${c.empresa_nome || ""}`, c.conversa_id ? `/whatsapp?c=${c.conversa_id}` : "/", `ch-${c.id}`));
      }
    }
  }
  return { conferidos: abertos?.length || 0, finalizados };
}
