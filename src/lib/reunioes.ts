// Reuniões: lê as anotações/transcrições do Meet (ou texto colado) e cria resumo, decisões e tarefas
import { db } from "./db";
import { agoraTexto, dataHora } from "./fmt";
import { chamarClaude, MODELO, normalizar } from "./analise";
import { buscarDocsReuniao, textoDoDoc } from "./drive";
import { lerConfig } from "./config";
import { notificar } from "./push";

const SISTEMA = `Você é o secretário pessoal do Maiccon, sócio da Outtax (escritório de contabilidade no RJ).
Você recebe as anotações ou a transcrição de uma reunião (a transcrição automática pode errar nomes: "acessórios" costuma ser o sistema "Acessórias", "domínio" o sistema "Domínio"). Produza:
- "titulo": nome curto da reunião (com o cliente/assunto).
- "resumo": 3 a 6 frases, o essencial.
- "decisoes": lista curta do que ficou decidido.
- "participantes": nomes que aparecem.
- "minhas": o que o MAICCON ficou de fazer (ou a Outtax, quando ele é o responsável). Cada item: {"tipo":"promessa"|"pedido"|"reuniao","titulo":"verbo no infinitivo + pessoa/empresa","prazo":ISO-8601 com -03:00 ou null,"detalhe":""}.
- "de_outros": o que OUTRAS pessoas ficaram de fazer e o Maiccon precisa acompanhar/cobrar: {"quem":"","titulo":"","prazo":ISO ou null}.
Prazos relativos ("semana que vem", "sexta") calculados a partir da DATA DA REUNIÃO informada. Sem prazo claro = null.
Responda SOMENTE JSON, sem crases:
{"titulo":"","resumo":"","decisoes":[],"participantes":[],"minhas":[],"de_outros":[]}`;

export async function analisarReuniao(id: string) {
  const sb = db();
  const { data: r } = await sb.from("reunioes").select("*").eq("id", id).single();
  if (!r) throw new Error("reunião não encontrada");
  let texto = r.texto as string | null;
  if (!texto && r.doc_id) { texto = await textoDoDoc(r.doc_id); await sb.from("reunioes").update({ texto: texto.slice(0, 200000) }).eq("id", id); }
  if (!texto || texto.length < 40) throw new Error("Documento vazio ou curto demais.");

  const conteudo = `Agora: ${agoraTexto()}\nData da reunião: ${r.data ? dataHora(r.data) : "desconhecida"}\nNome do documento: ${r.titulo}\n\n${texto.slice(0, 60000)}`;
  const { obj, uso } = await chamarClaude(SISTEMA, conteudo, MODELO(), 3000);
  await sb.from("ia_uso").insert({ conversa_id: null, tokens_in: uso.input_tokens || 0, tokens_out: uso.output_tokens || 0 });

  let criadas = 0;
  const prazoOk = (p: any) => { if (!p) return null; const d = new Date(p); return isNaN(d.getTime()) ? null : d.toISOString(); };
  for (const t of obj.minhas || []) {
    if (!t?.titulo) continue;
    const tipo = ["pedido", "promessa", "reuniao"].includes(t.tipo) ? t.tipo : "promessa";
    const { data } = await sb.from("tarefas").upsert({
      reuniao_id: id, tipo, categoria: "trabalho", titulo: String(t.titulo).slice(0, 200), detalhe: t.detalhe || `Reunião: ${obj.titulo || r.titulo}`,
      prazo: prazoOk(t.prazo), origem: "reuniao", hash: `reuniao|${id}|${tipo}|${normalizar(t.titulo)}`,
    }, { onConflict: "hash", ignoreDuplicates: true }).select("id");
    if (data?.length) criadas++;
  }
  for (const t of obj.de_outros || []) {
    if (!t?.titulo) continue;
    const titulo = `Cobrar ${t.quem || "equipe"}: ${t.titulo}`;
    const { data } = await sb.from("tarefas").upsert({
      reuniao_id: id, tipo: "outro", categoria: "trabalho", titulo: titulo.slice(0, 200), quem: t.quem || null,
      detalhe: `Combinado na reunião: ${obj.titulo || r.titulo}`, prazo: prazoOk(t.prazo), origem: "reuniao",
      hash: `reuniao|${id}|cobrar|${normalizar(titulo)}`,
    }, { onConflict: "hash", ignoreDuplicates: true }).select("id");
    if (data?.length) criadas++;
  }
  await sb.from("reunioes").update({
    titulo: obj.titulo || r.titulo, resumo: obj.resumo || null, decisoes: obj.decisoes || [], participantes: obj.participantes || [],
    analisada_em: new Date().toISOString(), ia_erro: null,
  }).eq("id", id);
  return { criadas, titulo: obj.titulo || r.titulo };
}

// Procura anotações novas no Drive e analisa (cron). Avisa no celular quando fica pronto.
export async function importarReunioes(analisarAte = 3) {
  const docs = await buscarDocsReuniao(14);
  const sb = db();
  const { data: ja } = await sb.from("reunioes").select("doc_id").in("doc_id", docs.length ? docs.map(d => d.id) : ["-"]);
  const existentes = new Set((ja || []).map((x: any) => x.doc_id));
  const novos = docs.filter(d => !existentes.has(d.id));
  if (novos.length) await sb.from("reunioes").insert(novos.map(d => ({ doc_id: d.id, titulo: d.nome, data: d.criado, link: d.link, origem: "drive" })));
  const { data: fila } = await sb.from("reunioes").select("id").is("analisada_em", null).is("ia_erro", null).order("data", { ascending: false }).limit(analisarAte);
  let analisadas = 0;
  for (const r of fila || []) {
    try {
      const x = await analisarReuniao(r.id); analisadas++;
      const cfg = await lerConfig();
      if (cfg.push_tarefa_nova) await notificar("🎙️ Resumo da reunião pronto", `${x.titulo} · ${x.criadas} tarefa(s)`, `/reunioes?r=${r.id}`, `re-${r.id}`);
    } catch (e: any) { await sb.from("reunioes").update({ ia_erro: String(e?.message ?? e).slice(0, 300) }).eq("id", r.id); }
  }
  return { encontrados: docs.length, novos: novos.length, analisadas };
}
