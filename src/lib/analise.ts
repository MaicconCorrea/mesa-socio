// IA "caçadora": lê as conversas e cria tarefas (pedidos, promessas, reuniões)
import { db } from "./db";
import { agoraTexto, dataHora } from "./fmt";
import { conflitos } from "./agenda";
import { googleConfigurado } from "./google";
import { lerConfig } from "./config";
import { notificar } from "./push";
import { estiloDoMaiccon } from "./estilo";
import { comDono } from "./contexto";
import { personalizar } from "./socios";
import { dbGlobal } from "./db";

export const MODELO = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
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

const SAIDA = `"sugestao_resposta": se a ÚLTIMA mensagem é de outra pessoa (em grupo: só se falou com o Maiccon), escreva a mensagem que o Maiccon mandaria agora, no jeito dele de escrever (veja os exemplos), pronta pra enviar; em assunto técnico (imposto, valores, prazos legais) não invente: diga que vai verificar/confirmar. Se não couber resposta, null.
"resumo": 1 a 2 frases dizendo o que está acontecendo e o que a pessoa quer.
Responda SOMENTE com JSON, sem crases e sem texto fora dele:
{"tarefas":[{"tipo":"pedido","categoria":"trabalho","titulo":"","detalhe":"","quem":"","prazo":null,"trecho":""}],"precisa_resposta":false,"resumo":"","sugestao_resposta":null}`;

export function normalizar(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function chamarClaude(sistema: string, conteudo: string, modelo: string, maxTokens = 1500) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada na Vercel");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, system: await personalizar(sistema), messages: [{ role: "user", content: await personalizar(conteudo) }] }),
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

  const estilo = await estiloDoMaiccon();
  const { obj, uso } = await chamarClaude(`${BASE}\n\n${MODO[modo]}\n\n${estilo}\n\n${SAIDA}`, conteudo, MODELO(), 2000);
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
    if (!error && data?.length) {
      criadas++;
      if (tipo === "reuniao" && prazo) await marcarConflito(data[0].id, prazo);
      await avisarTarefa(String(t.titulo), tipo, prazo, `/whatsapp?c=${conversaId}`);
    }
  }

  const ultimaDeMim = msgs[msgs.length - 1]?.de_mim;
  const cfg = await lerConfig();
  const sug = cfg.sugestao_auto && !ultimaDeMim && obj.sugestao_resposta ? String(obj.sugestao_resposta).trim().slice(0, 2000) : null;
  await sb.from("conversas").update({
    pendente_ia: false,
    analisada_em: new Date().toISOString(),
    precisa_resposta: modo !== "pessoal" && !ultimaDeMim && !!obj.precisa_resposta,
    resumo: obj.resumo ? String(obj.resumo).slice(0, 300) : conv.resumo,
    sugestao: sug, sugestao_em: sug ? new Date().toISOString() : null,
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
  const { data: fila } = await dbGlobal().from("conversas").select("id,dono")
    .eq("pendente_ia", true).neq("modo", "ignorada").not("dono", "is", null)
    .lt("ultima_msg_em", antes).order("ultima_msg_em", { ascending: true }).limit(limite);

  for (const c of fila || []) {
    try {
      const r = await comDono(c.dono, () => analisarConversa(c.id));
      resultado.analisadas++;
      resultado.tarefas += r.criadas;
    } catch (e: any) {
      const msg = e?.message || String(e);
      resultado.erros.push(msg);
      if (msg.includes("ANTHROPIC_API_KEY")) return resultado; // sem chave: mantém na fila
      await dbGlobal().from("conversas").update({ pendente_ia: false, ia_erro: msg.slice(0, 300) }).eq("id", c.id);
    }
  }

  // 2) Grupos do escritório silenciosos há X horas
  const corteParado = new Date(Date.now() - HORAS_PARADO() * 3600 * 1000).toISOString();
  const { data: parados } = await dbGlobal().from("conversas").select("id,dono")
    .eq("modo", "grupo").eq("checar_parado", true).eq("ultima_msg_de_mim", false)
    .lt("ultima_msg_em", corteParado).order("ultima_msg_em", { ascending: true }).limit(10);

  for (const c of parados || []) {
    try { await comDono(c.dono, () => checarGrupoParado(c.id)); resultado.grupos_checados++; }
    catch (e: any) {
      resultado.erros.push(e?.message || String(e));
      await dbGlobal().from("conversas").update({ checar_parado: false }).eq("id", c.id);
    }
  }
  return resultado;
}

// Chat com a IA sobre uma conversa ("o que ela quer?", "rascunha a resposta")
export async function perguntarIA(conversaId: string, historico: { role: "user" | "assistant"; content: string }[], pergunta: string, selecionadas: string[] = []) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada na Vercel");
  const sb = db();
  const { data: conv } = await sb.from("conversas").select("*").eq("id", conversaId).single();
  const { data: msgsDesc } = await sb.from("mensagens").select("*").eq("conversa_id", conversaId)
    .order("enviada_em", { ascending: false }).limit(60);
  const msgs = (msgsDesc || []).reverse();
  let foco = "";
  if (selecionadas.length) {
    const { data: sel } = await sb.from("mensagens").select("*").in("id", selecionadas).order("enviada_em");
    foco = `\n\nO MAICCON SELECIONOU ESTAS MENSAGENS — responda com foco nelas:\n${linhasMensagens(sel || [], Infinity).join("\n")}`;
  }
  const estilo = await estiloDoMaiccon();
  const sistema = `Você é o secretário pessoal do Maiccon, sócio da Outtax (escritório de contabilidade no RJ).
Responda em português, direto e curto. Tom do Maiccon: educado, próximo, objetivo.
Formato da sua resposta:
- Primeiro, se ajudar, uma explicação curta PARA O MAICCON (máx. 3 frases).
- Quando fizer sentido sugerir uma mensagem para ele mandar, coloque SÓ o texto da mensagem entre [MENSAGEM] e [/MENSAGEM].
- A mensagem é escrita em primeira pessoa, como se fosse o Maiccon digitando: natural, curta, sem asteriscos, sem aspas, sem itálico, sem "Olá, sou…". Nada de explicação dentro da mensagem.
- Em assunto técnico (imposto, prazo, valor), não afirme números ou limites que você não tem certeza; prefira "vou confirmar e te retorno".
Agora: ${agoraTexto()}.
Conversa de WhatsApp com ${conv?.nome || "contato"} (${conv?.is_grupo ? "grupo" : "individual"}, número ${conv?.instancia}):
${linhasMensagens(msgs, Infinity).join("\n")}${foco}

${estilo}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO(), max_tokens: 1200, system: await personalizar(sistema),
      messages: [...historico.slice(-10), { role: "user", content: pergunta }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  await registrarUso(conversaId, j.usage || {});
  return (j.content || []).map((c: any) => c.text || "").join("").trim();
}

// Reunião combinada bate com algo da agenda? Grava o aviso na tarefa.
export async function marcarConflito(tarefaId: string, prazoIso: string) {
  if (!googleConfigurado()) return;
  try {
    const ini = new Date(prazoIso), fim = new Date(ini.getTime() + 30 * 60000);
    const bate = await conflitos(ini, fim);
    if (bate.length) {
      const txt = bate.map(e => `${e.titulo} (${dataHora(e.inicio)})`).join("; ");
      await db().from("tarefas").update({ conflito: `Conflita com: ${txt}` }).eq("id", tarefaId);
    }
  } catch { /* agenda ainda não autorizada: ignora */ }
}

// ---------------- E-mail ----------------
const MODO_EMAIL = `ORIGEM: E-MAIL (caixa do Maiccon). Capture pedidos feitos a ele, promessas que ele fez nas respostas dele e reuniões combinadas.
Ignore assinaturas, avisos legais, rodapés e e-mails de sistema. Categoria "trabalho" salvo se for claramente pessoal.
"precisa_resposta": true só se a última mensagem é de uma pessoa e espera retorno dele. false para: prospecção/propaganda, newsletter, convite de agenda, aviso automático, cópia informativa.
ATENÇÃO A GOLPES: convite ou e-mail de remetente desconhecido com anexo/link estranho ("Attached from +1…", "Open media", "V-Messages", cobrança inesperada) — diga no resumo "⚠️ Parece golpe: não clique" e precisa_resposta = false.`;

export async function analisarEmail(threadId: string) {
  const { lerThread, textoDaThread } = await import("./gmail");
  const { minhaConta } = await import("./google");
  const sb = db();
  const t = await lerThread(minhaConta(), threadId);
  const { data: abertas } = await sb.from("tarefas").select("tipo,titulo,prazo").eq("email_thread_id", threadId).eq("status", "aberta");
  const conteudo = [
    `Agora: ${agoraTexto()} (horário de Brasília)`,
    `Assunto: ${t.assunto}`,
    `Tarefas abertas deste e-mail:`,
    ...(abertas?.length ? abertas.map((x: any) => `- [${x.tipo}] ${x.titulo}`) : ["- nenhuma"]),
    ``, `Considere NOVAS apenas as mensagens das últimas 72 horas.`, ``,
    textoDaThread(t).slice(-14000),
  ].join("\n");
  const { obj, uso } = await chamarClaude(`${BASE}\n\n${MODO_EMAIL}\n\n${SAIDA}`, conteudo, MODELO());
  await sb.from("ia_uso").insert({ conversa_id: null, tokens_in: uso.input_tokens || 0, tokens_out: uso.output_tokens || 0 });
  let criadas = 0;
  const ult = t.mensagens[t.mensagens.length - 1];
  for (const x of obj.tarefas || []) {
    if (!x?.titulo) continue;
    const tipo = ["pedido", "promessa", "reuniao"].includes(x.tipo) ? x.tipo : "outro";
    let prazo: string | null = null;
    if (x.prazo) { const d = new Date(x.prazo); if (!isNaN(d.getTime())) prazo = d.toISOString(); }
    const { data, error } = await sb.from("tarefas").upsert({
      email_thread_id: threadId, tipo, categoria: x.categoria === "pessoal" ? "pessoal" : "trabalho",
      titulo: String(x.titulo).slice(0, 200), detalhe: x.detalhe || `E-mail: ${t.assunto}`, quem: x.quem || ult?.de || null,
      prazo, trecho: x.trecho ? String(x.trecho).slice(0, 500) : null, origem: "email",
      hash: `email|${threadId}|${tipo}|${normalizar(x.titulo)}`,
    }, { onConflict: "hash", ignoreDuplicates: true }).select("id");
    if (!error && data?.length) {
      criadas++;
      if (tipo === "reuniao" && prazo) await marcarConflito(data[0].id, prazo);
      await avisarTarefa(String(x.titulo), tipo, prazo, `/email?thread=${threadId}`);
    }
  }
  // IA disse que não precisa responder (propaganda, aviso, convite): tira de "esperando você"
  const ultimaMinha = (ult?.deEmail || "").toLowerCase() === (await import("./google")).minhaConta();
  const dispensa = !ultimaMinha && obj.precisa_resposta === false ? (ult?.id ?? null) : null;
  await sb.from("email_threads").update({
    analisada_msg_id: ult?.id ?? null, resumo: obj.resumo ? String(obj.resumo).slice(0, 300) : null, ia_erro: null,
    ...(dispensa ? { ia_dispensou: dispensa, esperando: false } : {}),
  }).eq("thread_id", threadId);
  return { criadas };
}

async function avisarTarefa(titulo: string, tipo: string, prazo: string | null, url: string) {
  try {
    const cfg = await lerConfig();
    if (!cfg.push_tarefa_nova) return;
    const rot = tipo === "promessa" ? "Você prometeu" : tipo === "reuniao" ? "Reunião combinada" : "Pedido pra você";
    await notificar(`🤖 ${rot}`, `${titulo}${prazo ? " · " + dataHora(prazo) : ""}`, url);
  } catch { /* segue */ }
}

// Gera (de novo) a sugestão de resposta da conversa, no jeito do Maiccon
export async function sugerirResposta(conversaId: string, instrucao = "") {
  const sb = db();
  const { data: conv } = await sb.from("conversas").select("*").eq("id", conversaId).single();
  const { data: msgsDesc } = await sb.from("mensagens").select("*").eq("conversa_id", conversaId).order("enviada_em", { ascending: false }).limit(40);
  const msgs = (msgsDesc || []).reverse();
  const estilo = await estiloDoMaiccon();
  const sis = `Você escreve a próxima mensagem de WhatsApp do Maiccon (sócio da Outtax, escritório de contabilidade), como se fosse ele digitando.
${estilo}
Em assunto técnico (imposto, valores, prazos legais) não invente: diga que vai verificar e retornar.
Responda SOMENTE o texto da mensagem, sem aspas e sem explicação.`;
  const conteudo = `Agora: ${agoraTexto()}\nConversa com ${conv?.nome} (${conv?.is_grupo ? "grupo" : "individual"}):\n${linhasMensagens(msgs, Infinity).join("\n")}${instrucao ? `\n\nO Maiccon quer responder assim: ${instrucao}` : ""}`;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada na Vercel");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO(), max_tokens: 800, system: await personalizar(sis), messages: [{ role: "user", content: await personalizar(conteudo) }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  await registrarUso(conversaId, j.usage || {});
  const texto = (j.content || []).map((c: any) => c.text || "").join("").trim().replace(/^["“]|["”]$/g, "");
  await sb.from("conversas").update({ sugestao: texto, sugestao_em: new Date().toISOString() }).eq("id", conversaId);
  return texto;
}

// Cria tarefas só a partir das mensagens que o Maiccon selecionou (vale até em grupo)
export async function tarefasDaSelecao(conversaId: string, ids: string[]) {
  const sb = db();
  const { data: conv } = await sb.from("conversas").select("*").eq("id", conversaId).single();
  const { data: sel } = await sb.from("mensagens").select("*").in("id", ids).order("enviada_em");
  if (!sel?.length) return { criadas: 0 };
  const conteudo = `Agora: ${agoraTexto()}\nConversa: ${conv?.nome}\nO Maiccon selecionou estas mensagens e quer que virem tarefa(s) dele. Crie pelo menos uma.\n\nMensagens:\n${linhasMensagens(sel, 0).join("\n")}`;
  const { obj, uso } = await chamarClaude(`${BASE}\n\n${MODO.auto}\n\n${SAIDA}`, conteudo, MODELO());
  await registrarUso(conversaId, uso);
  let criadas = 0;
  for (const t of obj.tarefas || []) {
    if (!t?.titulo) continue;
    const tipo = ["pedido", "promessa", "reuniao"].includes(t.tipo) ? t.tipo : "outro";
    let prazo: string | null = null;
    if (t.prazo) { const d = new Date(t.prazo); if (!isNaN(d.getTime())) prazo = d.toISOString(); }
    const { data } = await sb.from("tarefas").upsert({
      conversa_id: conversaId, tipo, categoria: t.categoria === "pessoal" ? "pessoal" : "trabalho",
      titulo: String(t.titulo).slice(0, 200), detalhe: t.detalhe || null, quem: t.quem || conv?.nome || null, prazo,
      trecho: t.trecho ? String(t.trecho).slice(0, 500) : null, origem: "whatsapp", hash: `${conversaId}|${tipo}|${normalizar(t.titulo)}`,
    }, { onConflict: "hash", ignoreDuplicates: true }).select("id");
    if (data?.length) { criadas++; if (tipo === "reuniao" && prazo) await marcarConflito(data[0].id, prazo); }
  }
  return { criadas };
}
