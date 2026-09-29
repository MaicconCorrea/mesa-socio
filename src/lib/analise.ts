// IA "caçadora": lê as conversas e cria tarefas (pedidos, promessas, reuniões)
import { db } from "./db";
import { agoraTexto, dataHora } from "./fmt";

const MODELO = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MODELO_LEVE = () => process.env.ANTHROPIC_MODEL_LEVE || "claude-haiku-4-5-20251001";
const HORAS_PARADO = () => Number(process.env.HORAS_GRUPO_PARADO || 4);

const BASE = `Você é o secretário pessoal do Maiccon, sócio da Outtax (escritório de contabilidade no Rio de Janeiro).
Você lê trechos das conversas de WhatsApp dele e identifica o que ele NÃO pode esquecer — de trabalho E da vida pessoal.

Extraia itens SOMENTE das mensagens marcadas (NOVA). As antigas servem só de contexto.
Tipos:
- "pedido": alguém pediu algo ao Maiccon (documento, informação, ação, resposta a uma dúvida).
- "promessa": o Maiccon se comprometeu a fazer/enviar algo ("te envio", "vou ver", "amanhã te retorno", "consigo sim").
- "reuniao": combinaram reunião, call, ligação ou encontro com dia ou horário.
Categoria de cada item: "trabalho" ou "pessoal" (família, amigos, casa, saúde, lazer, compras pessoais).

Regras:
- Um pedido que o Maiccon respondeu "consigo, te envio depois" vira UMA tarefa do tipo "promessa" (não duas).
- Não repita nada que já está em "Tarefas abertas".
- Se o pedido já foi atendido nas próprias mensagens novas, não crie.
- Ignore cumprimentos, "ok", "obrigado", figurinhas e conversa social sem compromisso.
- "titulo": curto, começa com verbo no infinitivo e cita a pessoa/empresa. Ex.: "Enviar contrato Policlínica ↔ Lino para Juliane".
- "prazo": ISO 8601 com -03:00, ou null. "final do dia"/"hoje" = hoje 18:00; "amanhã" sem hora = amanhã 12:00; "às 14" = hoje 14:00 (se já passou, amanhã). Reunião/encontro: o horário combinado.
- "trecho": a frase da conversa que originou o item (curta).`;

const MODO: Record<string, string> = {
  auto: `MODO AUTOMÁTICO (conversa individual): capture pedidos, promessas e reuniões e classifique cada um em "trabalho" ou "pessoal".
"precisa_resposta": true se a ÚLTIMA mensagem é da outra pessoa e espera retorno do Maiccon (pergunta, pedido, arquivo para ele olhar). false se foi só "ok"/"obrigado"/figurinha ou se o Maiccon foi o último a falar.`,
  pessoal: `MODO PESSOAL (família/amigos): capture só compromissos pessoais (encontros, favores, pagamentos, datas, coisas a comprar ou resolver). Todos com categoria "pessoal". Não crie nada de conversa corriqueira.
"precisa_resposta": sempre false.`,
  grupo: `MODO GRUPO DO ESCRITÓRIO: este é um grupo de cliente em que a EQUIPE da Outtax atende. O Maiccon é sócio e só acompanha.
- Pedidos gerais ao escritório NÃO viram tarefa: a equipe cuida.
- Crie tarefa SOMENTE de mensagens NOVAS marcadas (CITOU MAICCON), ou de mensagens do próprio Maiccon em que ele promete algo.
- Categoria sempre "trabalho".
"precisa_resposta": true só se uma mensagem que cita o Maiccon ainda espera resposta DELE. Caso contrário false.`,
};

const SAIDA = `Responda SOMENTE com JSON, sem crases e sem texto fora dele:
{"tarefas":[{"tipo":"pedido","categoria":"trabalho","titulo":"","detalhe":"","quem":"","prazo":null,"trecho":""}],"precisa_resposta":false,"resumo":"uma frase sobre a conversa"}`;

function normalizar(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

async function chamarClaude(sistema: string, conteudo: string, modelo: string, maxTokens = 1500) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada na Vercel");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system: sistema, messages: [{ role: "user", content: conteudo }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const texto = (j.content || []).map((c: any) => c.text || "").join("").replace(/```json|```/g, "").trim();
  const ini = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  return { obj: JSON.parse(texto.slice(ini, fim + 1)), uso: j.usage || {} };
}

async function registrarUso(conversaId: string, uso: any) {
  await db().from("ia_uso").insert({ conversa_id: conversaId, tokens_in: uso.input_tokens || 0, tokens_out: uso.output_tokens || 0 });
}

function linhasMensagens(msgs: any[], corte: number) {
  return msgs.map((m: any) => {
    const nova = new Date(m.enviada_em).getTime() > corte ? " (NOVA)" : "";
    const citou = m.me_citou ? " (CITOU MAICCON)" : "";
    const quem = m.de_mim ? "Maiccon" : (m.autor || "Contato");
    return `[${dataHora(m.enviada_em)}] ${quem}: ${m.texto}${citou}${nova}`;
  });
}

export async function analisarConversa(conversaId: string) {
  const sb = db();
  const { data: conv } = await sb.from("conversas").select("*").eq("id", conversaId).single();
  if (!conv || conv.modo === "ignorada") return { criadas: 0 };
  const modo = MODO[conv.modo] ? conv.modo : "auto";

  const { data: msgsDesc } = await sb.from("mensagens").select("*")
    .eq("conversa_id", conversaId).order("enviada_em", { ascending: false }).limit(40);
  const msgs = (msgsDesc || []).reverse();
  if (!msgs.length) {
    await sb.from("conversas").update({ pendente_ia: false }).eq("id", conversaId);
    return { criadas: 0 };
  }

  const { data: abertas } = await sb.from("tarefas").select("tipo,titulo,prazo")
    .eq("conversa_id", conversaId).eq("status", "aberta");

  const corte = conv.analisada_em ? new Date(conv.analisada_em).getTime() : 0;
  const conteudo = [
    `Agora: ${agoraTexto()} (horário de Brasília)`,
    `Conversa: ${conv.nome || conv.jid} (${conv.is_grupo ? "grupo" : "individual"}, WhatsApp ${conv.instancia})`,
    `Tarefas abertas desta conversa:`,
    ...(abertas?.length ? abertas.map((t: any) => `- [${t.tipo}] ${t.titulo}${t.prazo ? " até " + dataHora(t.prazo) : ""}`) : ["- nenhuma"]),
    ``,
    `Mensagens:`,
    ...linhasMensagens(msgs, corte),
  ].join("\n");

  const { obj, uso } = await chamarClaude(`${BASE}\n\n${MODO[modo]}\n\n${SAIDA}`, conteudo, MODELO());
  await registrarUso(conversaId, uso);

  let criadas = 0;
  for (const t of obj.tarefas || []) {
    if (!t?.titulo) continue;
    const tipo = ["pedido", "promessa", "reuniao"].includes(t.tipo) ? t.tipo : "outro";
    const categoria = modo === "pessoal" ? "pessoal" : modo === "grupo" ? "trabalho"
      : (t.categoria === "pessoal" ? "pessoal" : "trabalho");
    let prazo: string | null = null;
    if (t.prazo) { const d = new Date(t.prazo); if (!isNaN(d.getTime())) prazo = d.toISOString(); }
    const { error, data } = await sb.from("tarefas").upsert({
      conversa_id: conversaId, tipo, categoria,
      titulo: String(t.titulo).slice(0, 200),
      detalhe: t.detalhe || null,
      quem: t.quem || conv.nome || null,
      prazo,
      trecho: t.trecho ? String(t.trecho).slice(0, 500) : null,
      origem: "whatsapp",
      hash: `${conversaId}|${tipo}|${normalizar(t.titulo)}`,
    }, { onConflict: "hash", ignoreDuplicates: true }).select("id");
    if (!error && data?.length) criadas++;
  }

  const ultimaDeMim = msgs[msgs.length - 1]?.de_mim;
  await sb.from("conversas").update({
    pendente_ia: false,
    analisada_em: new Date().toISOString(),
    precisa_resposta: modo !== "pessoal" && !ultimaDeMim && !!obj.precisa_resposta,
    resumo: obj.resumo ? String(obj.resumo).slice(0, 300) : conv.resumo,
    ia_erro: null,
  }).eq("id", conversaId);

  return { criadas };
}

// Grupo do escritório parado: o cliente pediu algo e ninguém do time respondeu?
const SIS_PARADO = `Você supervisiona o atendimento de um escritório de contabilidade no WhatsApp.
Este é um grupo entre um CLIENTE e a EQUIPE do escritório (Outtax). Pelo conteúdo, identifique quem é cliente e quem é equipe
(a equipe costuma dizer "segue", "vou verificar", "encaminhei", "bom dia, tudo bem?", manda guias e documentos).
Pergunta: a conversa terminou com um pedido, dúvida ou cobrança do CLIENTE que ainda não teve retorno da equipe?
"ok", "obrigado", figurinha, aviso sem pergunta ou mensagem da própria equipe = false.
Responda SOMENTE JSON: {"sem_retorno":true,"motivo":"frase curta: quem pediu o quê"}`;

export async function checarGrupoParado(conversaId: string) {
  const sb = db();
  const { data: conv } = await sb.from("conversas").select("*").eq("id", conversaId).single();
  if (!conv) return;
  const { data: msgsDesc } = await sb.from("mensagens").select("*")
    .eq("conversa_id", conversaId).order("enviada_em", { ascending: false }).limit(15);
  const msgs = (msgsDesc || []).reverse();
  if (!msgs.length || msgs[msgs.length - 1].de_mim) {
    await sb.from("conversas").update({ checar_parado: false, sem_retorno: false }).eq("id", conversaId);
    return;
  }
  const conteudo = `Agora: ${agoraTexto()}\nGrupo: ${conv.nome}\n\nMensagens:\n` + linhasMensagens(msgs, Infinity).join("\n");
  const { obj, uso } = await chamarClaude(SIS_PARADO, conteudo, MODELO_LEVE(), 300);
  await registrarUso(conversaId, uso);
  await sb.from("conversas").update({
    checar_parado: false,
    sem_retorno: !!obj.sem_retorno,
    resumo: obj.motivo ? String(obj.motivo).slice(0, 300) : conv.resumo,
  }).eq("id", conversaId);
}

// Rodado pelo cron a cada 2 min
export async function analisarPendentes(limite = 8) {
  const sb = db();
  const resultado = { analisadas: 0, tarefas: 0, grupos_checados: 0, erros: [] as string[] };

  // 1) Conversas com mensagem nova (espera 90s de silêncio pra ler o "bloco" inteiro)
  const antes = new Date(Date.now() - 90 * 1000).toISOString();
  const { data: fila } = await sb.from("conversas").select("id")
    .eq("pendente_ia", true).neq("modo", "ignorada")
    .lt("ultima_msg_em", antes).order("ultima_msg_em", { ascending: true }).limit(limite);

  for (const c of fila || []) {
    try {
      const r = await analisarConversa(c.id);
      resultado.analisadas++;
      resultado.tarefas += r.criadas;
    } catch (e: any) {
      const msg = e?.message || String(e);
      resultado.erros.push(msg);
      if (msg.includes("ANTHROPIC_API_KEY")) return resultado; // sem chave: mantém na fila
      await sb.from("conversas").update({ pendente_ia: false, ia_erro: msg.slice(0, 300) }).eq("id", c.id);
    }
  }

  // 2) Grupos do escritório silenciosos há X horas
  const corteParado = new Date(Date.now() - HORAS_PARADO() * 3600 * 1000).toISOString();
  const { data: parados } = await sb.from("conversas").select("id")
    .eq("modo", "grupo").eq("checar_parado", true).eq("ultima_msg_de_mim", false)
    .lt("ultima_msg_em", corteParado).order("ultima_msg_em", { ascending: true }).limit(10);

  for (const c of parados || []) {
    try { await checarGrupoParado(c.id); resultado.grupos_checados++; }
    catch (e: any) {
      resultado.erros.push(e?.message || String(e));
      await sb.from("conversas").update({ checar_parado: false }).eq("id", c.id);
    }
  }
  return resultado;
}
