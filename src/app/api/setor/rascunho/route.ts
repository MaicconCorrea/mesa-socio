import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chamarClaude, MODELO } from "@/lib/analise";
import { dataHora } from "@/lib/fmt";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

// IA escreve o chamado (assunto, descrição, setor) a partir da conversa, do e-mail ou da tarefa
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { conversaId, threadId, tarefaId } = await req.json().catch(() => ({}));
  const sb = db();
  let contexto = "", nomeBase = "";
  try {
    if (tarefaId) {
      const { data: t } = await sb.from("tarefas").select("*").eq("id", tarefaId).single();
      if (t) { contexto += `Tarefa: ${t.titulo}\n${t.detalhe || ""}\n${t.trecho ? "Trecho: " + t.trecho : ""}\nQuem: ${t.quem || ""}\n`; nomeBase = t.quem || ""; }
    }
    const cid = conversaId || (tarefaId ? (await sb.from("tarefas").select("conversa_id,email_thread_id").eq("id", tarefaId).single()).data?.conversa_id : null);
    if (cid) {
      const { data: c } = await sb.from("conversas").select("nome,empresa_cnpj").eq("id", cid).single();
      const { data: ms } = await sb.from("mensagens").select("de_mim,autor,texto,enviada_em").eq("conversa_id", cid).order("enviada_em", { ascending: false }).limit(40);
      contexto += `\nConversa de WhatsApp com ${c?.nome}:\n` + (ms || []).reverse().map(m => `[${dataHora(m.enviada_em)}] ${m.de_mim ? "Maiccon" : m.autor}: ${m.texto}`).join("\n");
      nomeBase = c?.nome || nomeBase;
      if (c?.empresa_cnpj) {
        const { data: e } = await sb.from("empresas").select("cnpj,razao").eq("cnpj", c.empresa_cnpj).single();
        if (e) return NextResponse.json({ ...(await rascunhar(contexto)), empresa: e });
      }
    }
    if (threadId) {
      const { lerThread, textoDaThread } = await import("@/lib/gmail");
      const { minhaConta } = await import("@/lib/google");
      const t = await lerThread(minhaConta(), threadId);
      contexto += `\nE-mail "${t.assunto}":\n` + textoDaThread(t).slice(-12000);
      nomeBase = t.mensagens[0]?.de || nomeBase;
    }
    return NextResponse.json({ ...(await rascunhar(contexto)), busca: nomeBase });
  } catch (e) { return erro(e); }
}

async function rascunhar(contexto: string) {
  const sis = `Você escreve chamados internos para os setores de um escritório de contabilidade (Outtax), a pedido do sócio Maiccon.
Setores: Contábil (balanço, lançamentos, DRE, conciliação), Fiscal (impostos, guias DAS/ISS/ICMS, certidões, declarações, notas de serviço), Pessoal (folha, admissão, rescisão, férias, FGTS, INSS, pró-labore), Legalização (abertura, alteração contratual, baixa, alvarás, certificado digital), Nota Fiscal (emissão de NF).
Escreva o chamado COMPLETO pra o setor executar sem precisar perguntar nada ao cliente: o que foi pedido, dados já informados, prazo, e o que falta (se faltar).
Responda SOMENTE JSON: {"assunto":"curto","descricao":"texto do chamado","setor":"Contábil|Fiscal|Pessoal|Legalização|Nota Fiscal","empresa":"nome da empresa do cliente se aparecer, senão vazio","prioridade":2}`;
  const { obj } = await chamarClaude(sis, contexto.slice(-20000), MODELO(), 1200);
  return obj;
}
