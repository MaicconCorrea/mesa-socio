import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lerThread, textoDaThread } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { linhasMensagens, MODELO } from "@/lib/analise";
import { estiloDoMaiccon } from "@/lib/estilo";
import { personalizar } from "@/lib/socios";
import { agoraTexto } from "@/lib/fmt";
import { meusNumeros } from "@/lib/numeros";
import { processarDoc } from "@/lib/docs";
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
    // documentos: usa o texto já lido (lê agora os que ainda não foram lidos)
    const sb = db();
    let { data: docs } = await sb.from("tarefa_docs").select("id,nome,mime,caminho,texto,status,paginas,erro").eq("tarefa_id", tarefaId).order("criado_em");
    for (const d of docs || []) if (d.status !== "lido" && d.status !== "erro") { await processarDoc(sb, d); }
    if (docs?.some((d: any) => d.status !== "lido" && d.status !== "erro")) ({ data: docs } = await sb.from("tarefa_docs").select("id,nome,mime,caminho,texto,status,paginas,erro").eq("tarefa_id", tarefaId).order("criado_em"));
    const blocoDocs = (docs || []).map((d: any) => d.status === "lido"
      ? `<documento nome="${d.nome}"${d.paginas ? ` paginas="${d.paginas}"` : ""}>\n${d.texto}\n</documento>`
      : `<documento nome="${d.nome}">(NÃO FOI POSSÍVEL LER: ${d.erro || "erro"}. Diga isso ao Maiccon se precisar dele.)</documento>`).join("\n\n");

    const sistema = `Você é o Claude, assistente de IA trabalhando para o Maiccon, sócio da Outtax (escritório de contabilidade e BPO financeiro no Rio de Janeiro).
Converse com ele exatamente como no chat do Claude: natural, direto, útil. Ele é o especialista; você executa.

Como trabalhar:
- Faça o que ele pedir, na hora. Se pedir um documento, ENTREGUE o documento completo nesta resposta — não peça confirmação antes.
- Use tudo o que estiver nos documentos anexados e no contexto da tarefa. Leia com atenção: razão social, CNPJ, NIRE, endereço, sócios, qualificação (nacionalidade, estado civil, profissão, CPF, RG), administradores.
- Dado que não existe em lugar nenhum vira [PREENCHER: o que é]. No FINAL, liste em poucas linhas o que ficou para preencher. Pergunte só se for impossível avançar.
- Nunca diga que leu algo que não está nos documentos. Se um documento não pôde ser lido, avise.
- Documento para baixar (contrato, proposta, declaração, procuração, parecer, e-mail formal longo): coloque o documento inteiro entre [DOCUMENTO titulo="Nome do documento"] e [/DOCUMENTO]. Dentro: "# " título, "## " seções/cláusulas, "- " itens, **negrito**, e tabelas em markdown (| col | col |) quando fizer sentido (ex.: parcelas). Sem comentários seus dentro do documento.
- Mensagem curta para ele mandar a alguém (WhatsApp/e-mail): coloque entre [MENSAGEM] e [/MENSAGEM], em primeira pessoa, no jeito dele. Só quando ele pedir ou quando for claramente útil.
- Tributos (retenções, alíquotas): use a regra geral correta quando souber e marque [CONFERIR COM O FISCAL] quando depender do caso.
- Ao final de contratos, uma linha lembrando de revisar com o jurídico antes de assinar.
- Hoje: ${agoraTexto()}.

<tarefa>
${t.titulo}
Tipo: ${t.tipo} · Quem: ${t.quem || "-"} · Prazo: ${t.prazo || "sem prazo"}
Detalhe: ${t.detalhe || "-"}
Trecho: ${t.trecho || "-"}
</tarefa>

<origem>
${origem || "(anotação manual, sem conversa de origem)"}
</origem>
${blocoDocs ? `\n<documentos_anexados>\n${blocoDocs}\n</documentos_anexados>` : ""}

${await estiloDoMaiccon()}`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL_IA || MODELO(), max_tokens: 16000, system: await personalizar(sistema),
        messages: [...(Array.isArray(historico) ? historico.slice(-16) : []), { role: "user", content: String(pergunta) }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `IA ${r.status}`);
    await db().from("ia_uso").insert({ conversa_id: null, tokens_in: j.usage?.input_tokens || 0, tokens_out: j.usage?.output_tokens || 0 }).then(() => {}, () => {});
    return NextResponse.json({ resposta: (j.content || []).map((c: any) => c.text || "").join("") });
  } catch (e) { return erro(e); }
}
