import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lerThread, textoDaThread } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { linhasMensagens, MODELO } from "@/lib/analise";
import { estiloDoMaiccon } from "@/lib/estilo";
import { personalizar } from "@/lib/socios";
import { agoraTexto } from "@/lib/fmt";
import { meusNumeros } from "@/lib/numeros";
import { blocosParaIA } from "@/lib/docs";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 300; // documento longo (contrato) leva mais tempo pra IA escrever

// Contexto de uma tarefa: de onde ela veio (conversa, e-mail ou reunião) + para onde responder
async function contexto(tarefaId: string) {
  const sb = db();
  const { data: t } = await sb.from("tarefas").select("*").eq("id", tarefaId).single();
  if (!t) throw new Error("tarefa não encontrada");
  let origem = "", destino: any = null;
  if (t.conversa_id) {
    const [{ data: c }, { data: ms }] = await Promise.all([
      sb.from("conversas").select("id,nome,instancia,is_grupo").eq("id", t.conversa_id).single(),
      sb.from("mensagens").select("*").eq("conversa_id", t.conversa_id).order("enviada_em", { ascending: false }).limit(60),
    ]);
    origem = `Conversa (${c?.instancia === "gchat" ? "Google Chat" : "WhatsApp"}) com ${c?.nome}:\n${linhasMensagens((ms || []).reverse(), Infinity).join("\n")}`;
    if (c) destino = { tipo: "conversa", id: c.id, nome: c.nome, instancia: c.instancia };
  } else if (t.email_thread_id) {
    try {
      const th = await lerThread(minhaConta(), t.email_thread_id);
      origem = `E-mail "${th.assunto}":\n${textoDaThread(th).slice(-9000)}`;
      const ult = [...th.mensagens].reverse().find(m => m.deEmail && m.deEmail.toLowerCase() !== minhaConta()) || th.mensagens[0];
      destino = { tipo: "email", threadId: th.id, para: ult?.deEmail || "", assunto: /^re:/i.test(th.assunto) ? th.assunto : `Re: ${th.assunto}`, nome: ult?.de || ult?.deEmail };
    } catch { origem = "(não consegui ler o e-mail de origem)"; }
  } else if (t.reuniao_id) {
    const { data: r } = await sb.from("reunioes").select("titulo,resumo,texto").eq("id", t.reuniao_id).maybeSingle();
    if (r) origem = `Reunião "${r.titulo}". Resumo: ${r.resumo || ""}\nTrecho da transcrição:\n${String(r.texto || "").slice(0, 8000)}`;
  }
  return { t, origem, destino };
}

// GET ?id= → para onde responder (destino padrão)
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  try {
    const [{ destino }, nums] = await Promise.all([contexto(req.nextUrl.searchParams.get("id") || ""), meusNumeros()]);
    return NextResponse.json({ destino, numeros: nums.map(n => ({ instancia: n.instancia, nome: n.nome })) });
  }
  catch (e) { return erro(e); }
}

// POST { tarefaId, pergunta, historico } → conversa com a IA sobre a tarefa
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { tarefaId, pergunta, historico } = await req.json().catch(() => ({}));
  if (!pergunta) return NextResponse.json({ erro: "escreva a pergunta" }, { status: 400 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ erro: "ANTHROPIC_API_KEY não configurada" }, { status: 400 });
  try {
    const { t, origem } = await contexto(tarefaId);
    const { data: docs } = await db().from("tarefa_docs").select("nome,mime,caminho").eq("tarefa_id", tarefaId).order("criado_em");
    const anexos = docs?.length ? [
      { role: "user", content: [...(await blocosParaIA(docs)), { type: "text", text: `Estes são os documentos anexados a esta tarefa (${docs.map((d: any) => d.nome).join(", ")}). Use-os como base.` }] },
      { role: "assistant", content: "Recebi os documentos e vou usá-los." },
    ] : [];
    const sistema = `Você é o secretário pessoal do Maiccon, sócio da Outtax (escritório de contabilidade e BPO no RJ). Ele quer RESOLVER esta tarefa agora.
Ajude de forma prática: diga o caminho mais curto, escreva o que ele precisa mandar e, se for o caso, redija o documento/texto pedido (contrato simples, e-mail, orientação ao cliente).
Formato:
- Explicação para o Maiccon, curta (máx. 4 frases), quando ajudar.
- Mensagem pronta para mandar ao cliente SEMPRE entre [MENSAGEM] e [/MENSAGEM], em primeira pessoa, no jeito dele, sem asteriscos.
- Em imposto, prazo legal ou valor: não invente número; diga "vou confirmar e te retorno" ou sugira mandar pro setor.
- Quando pedirem um DOCUMENTO (contrato, proposta, declaração, procuração, e-mail formal longo): escreva o documento COMPLETO entre [DOCUMENTO titulo="Nome do documento"] e [/DOCUMENTO].
  Dentro dele use "# " para o título, "## " para cada cláusula/seção, "- " para itens e **negrito** só em nomes das partes e termos-chave. Nada de comentários seus dentro do documento.
  Use os dados dos documentos anexados (razão social, CNPJ, endereço, sócios/representantes). O que não estiver nos anexos, deixe como [PREENCHER: …] — nunca invente.
  Em contrato de locação/cessão de mão de obra, cubra: objeto e escopo, prazo e vigência, valor global, forma de pagamento por medição mensal (boletim de medição, aprovação, prazo de pagamento), reajuste, retenções legais sobre notas fiscais (indique como [CONFERIR COM O FISCAL]), obrigações trabalhistas e previdenciárias da contratada, responsabilidade, confidencialidade/LGPD, rescisão e multa, foro.
  Depois do documento, em 1–2 frases, lembre de revisar com o jurídico antes de assinar.
Agora: ${agoraTexto()}.

TAREFA: ${t.titulo}
Tipo: ${t.tipo} · Quem: ${t.quem || "-"} · Prazo: ${t.prazo || "sem prazo"}
Detalhe: ${t.detalhe || "-"}
Trecho: ${t.trecho || "-"}

DE ONDE VEIO:
${origem || "(anotação manual, sem conversa de origem)"}

${await estiloDoMaiccon()}`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELO(), max_tokens: 12000, system: await personalizar(sistema),
        messages: [...anexos, ...(Array.isArray(historico) ? historico.slice(-10) : []), { role: "user", content: String(pergunta) }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `IA ${r.status}`);
    await db().from("ia_uso").insert({ conversa_id: null, tokens_in: j.usage?.input_tokens || 0, tokens_out: j.usage?.output_tokens || 0 }).then(() => {}, () => {});
    return NextResponse.json({ resposta: (j.content || []).map((c: any) => c.text || "").join("") });
  } catch (e) { return erro(e); }
}
