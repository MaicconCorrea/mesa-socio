import { NextRequest, NextResponse } from "next/server";
import { socioAtual } from "@/lib/socios";
import { db } from "@/lib/db";
import { criarSolicitacao } from "@/lib/acessorias";
import { baixarMidia } from "@/lib/evolution";
import { baixarAnexoChat } from "@/lib/gchat";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 120;

// Abre o chamado no Acessórias (com anexos da conversa/e-mail/computador) e registra na Mesa
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  if (!b.empresa_cnpj || !b.departamento || !b.assunto || !b.descricao) return NextResponse.json({ erro: "Preencha empresa, setor, assunto e descrição." }, { status: 400 });
  const sb = db();
  try {
    const arquivos: { nome: string; bytes: Buffer; mime?: string }[] = [];
    for (const a of b.arquivos || []) arquivos.push({ nome: a.nome, mime: a.mime, bytes: Buffer.from(a.base64, "base64") });
    for (const mid of b.midias || []) {
      const { data: m } = await sb.from("mensagens").select("msg_id,midia_nome,midia_mime,midia_ref,tipo,conversa_id").eq("id", mid).single();
      if (!m) continue;
      const { data: c } = await sb.from("conversas").select("instancia").eq("id", m.conversa_id).single();
      const arq: any = m.midia_ref ? await baixarAnexoChat(m.midia_ref).then(x => x ? { ...x, nome: m.midia_nome } : null) : await baixarMidia(c?.instancia || "", m.msg_id);
      if (arq) arquivos.push({ nome: m.midia_nome || arq.nome || `${m.tipo || "arquivo"}-${m.msg_id.slice(-6)}.${(m.midia_mime || arq.mime).split("/")[1]?.split(";")[0] || "bin"}`, mime: m.midia_mime || arq.mime, bytes: arq.bytes });
    }
    if (b.anexosEmail?.length) {
      const { baixarAnexo } = await import("@/lib/gmail");
      const { minhaConta } = await import("@/lib/google");
      for (const s of b.anexosEmail as string[]) { const [msg, att, nome, mime] = s.split("|"); arquivos.push({ nome, mime, bytes: await baixarAnexo(minhaConta(), msg, att) }); }
    }
    const solId = await criarSolicitacao({
      assunto: b.assunto, empresa: b.empresa_cnpj, departamento: String(b.departamento),
      descricao: `${b.descricao}\n\n— Enviado por ${(await socioAtual()).nome} (Mesa do Sócio)`, prioridade: Number(b.prioridade ?? 2), prazo: b.prazo || null, arquivos,
    });
    const { data: ch } = await sb.from("chamados").insert({
      sol_id: solId, empresa_cnpj: b.empresa_cnpj, empresa_nome: b.empresa_nome, departamento: String(b.departamento), departamento_nome: b.departamento_nome,
      assunto: b.assunto, descricao: b.descricao, conversa_id: b.conversaId || null, email_thread_id: b.threadId || null, tarefa_id: b.tarefaId || null,
    }).select("id").single();
    if (b.conversaId) await sb.from("conversas").update({ empresa_cnpj: b.empresa_cnpj }).eq("id", b.conversaId);
    if (b.tarefaId && b.manterAberta) {
      // reunião: a tarefa fica na Mesa pra cobrar; fecha sozinha quando o setor finalizar o chamado
      const { data: t } = await sb.from("tarefas").select("titulo").eq("id", b.tarefaId).single();
      const base = String(t?.titulo || b.assunto).replace(/^Cobrar [^:]+:\s*/, "");
      await sb.from("tarefas").update({ chamado_id: ch?.id, titulo: `Cobrar ${b.departamento_nome || "setor"}: ${base}`.slice(0, 200),
        quem: b.departamento_nome || null, detalhe: `Chamado #${solId} no Acessórias (${b.departamento_nome}) — ${b.empresa_nome || ""}`, ...(b.prazo ? { prazo: new Date(b.prazo + "T18:00:00-03:00").toISOString() } : {}) }).eq("id", b.tarefaId);
    } else if (b.tarefaId) await sb.from("tarefas").update({ status: "feita", concluida_em: new Date().toISOString(), chamado_id: ch?.id, detalhe: `Delegado ao ${b.departamento_nome} — chamado #${solId}` }).eq("id", b.tarefaId);
    return NextResponse.json({ ok: true, solId, anexos: arquivos.length });
  } catch (e) { return erro(e); }
}
