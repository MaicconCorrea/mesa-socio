// Resumo do dia (8h) e do fim do dia (17:30)
import { db } from "./db";
import { dataHora, fimDoDia, hojeISO } from "./fmt";
import { googleConfigurado } from "./google";
import { listarEventos } from "./agenda";

const hm = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export async function montarResumo(periodo: "manha" | "tarde") {
  const sb = db();
  const agora = new Date();
  const fimHoje = fimDoDia();
  const amanha = new Date(fimHoje.getTime() + 1000);
  const fimAmanha = new Date(fimHoje.getTime() + 86400000);

  const { data: tarefas } = await sb.from("tarefas").select("titulo,tipo,prazo,categoria,quem").eq("status", "aberta")
    .order("prazo", { ascending: true, nullsFirst: false });
  const t = tarefas || [];
  const atrasadas = t.filter(x => x.prazo && new Date(x.prazo) < agora);
  const hoje = t.filter(x => x.prazo && new Date(x.prazo) >= agora && new Date(x.prazo) <= fimHoje);
  const deAmanha = t.filter(x => x.prazo && new Date(x.prazo) > fimHoje && new Date(x.prazo) <= fimAmanha);
  const semPrazo = t.filter(x => !x.prazo);

  const { data: esperando } = await sb.from("conversas").select("nome,instancia,ultima_msg_em")
    .eq("precisa_resposta", true).eq("ultima_msg_de_mim", false).in("modo", ["auto", "grupo"]).order("ultima_msg_em");
  const { data: parados } = await sb.from("conversas").select("nome,resumo").eq("modo", "grupo").eq("sem_retorno", true).eq("ultima_msg_de_mim", false);
  const { data: emails } = await sb.from("email_threads").select("de,assunto").eq("esperando", true).eq("status", "nova").order("recebido_em");
  const { data: feitasHoje } = periodo === "tarde"
    ? await sb.from("tarefas").select("titulo").eq("status", "feita").gte("concluida_em", new Date(`${hojeISO()}T00:00:00-03:00`).toISOString())
    : { data: [] as any[] };

  let eventos: any[] = [];
  let erroAgenda = "";
  if (googleConfigurado()) {
    try {
      eventos = periodo === "manha" ? await listarEventos(agora, fimHoje) : await listarEventos(amanha, fimAmanha);
      eventos = eventos.filter(e => e.minhaResposta !== "declined");
    } catch (e: any) { erroAgenda = e.message; }
  }

  const linha = (x: any) => `• ${x.titulo}${x.prazo ? ` (${periodo === "manha" || new Date(x.prazo) < agora ? dataHora(x.prazo) : hm(x.prazo)})` : ""}${x.categoria === "pessoal" ? " 🏠" : ""}`;
  const partes: string[] = [];
  const titulo = periodo === "manha" ? "☀️ Bom dia, Maiccon! Seu dia:" : "🌙 Fechamento do dia";
  partes.push(`*${titulo}*`);

  if (periodo === "manha") {
    partes.push(`\n📅 *Agenda de hoje* (${eventos.length})`);
    partes.push(eventos.length ? eventos.map(e => `• ${e.diaInteiro ? "dia inteiro" : hm(e.inicio)} — ${e.titulo}${e.meet ? " 🎥" : ""}`).join("\n") : erroAgenda ? "• (agenda indisponível)" : "• livre");
  }
  if (atrasadas.length) partes.push(`\n🔥 *Atrasadas* (${atrasadas.length})\n${atrasadas.slice(0, 10).map(linha).join("\n")}`);
  if (periodo === "manha") {
    partes.push(`\n📌 *Pra hoje* (${hoje.length})\n${hoje.length ? hoje.map(linha).join("\n") : "• nada com prazo hoje"}`);
  } else {
    if (hoje.length) partes.push(`\n⏳ *Ainda hoje* (${hoje.length})\n${hoje.map(linha).join("\n")}`);
    partes.push(`\n🗓️ *Amanhã*\n${[...eventos.map(e => `• ${e.diaInteiro ? "dia inteiro" : hm(e.inicio)} — ${e.titulo}${e.meet ? " 🎥" : ""}`), ...deAmanha.map(linha)].join("\n") || "• nada marcado"}`);
    if (feitasHoje?.length) partes.push(`\n✅ *Resolvido hoje:* ${feitasHoje.length} tarefa(s)`);
  }
  if (esperando?.length) partes.push(`\n💬 *Esperando resposta sua no WhatsApp* (${esperando.length})\n${esperando.slice(0, 10).map(c => `• ${c.nome} (📱${c.instancia.replace(/^socio-/, "")})`).join("\n")}`);
  if (emails?.length) partes.push(`\n✉️ *E-mails esperando você* (${emails.length})\n${emails.slice(0, 8).map(e => `• ${e.de} — ${e.assunto}`).join("\n")}`);
  if (parados?.length) partes.push(`\n👥 *Grupos sem retorno do time* (${parados.length})\n${parados.slice(0, 8).map(c => `• ${c.nome}${c.resumo ? ": " + c.resumo : ""}`).join("\n")}`);
  if (semPrazo.length && periodo === "manha") partes.push(`\n📋 Mais ${semPrazo.length} tarefa(s) sem prazo na Mesa.`);
  partes.push(`\n👉 ${process.env.MESA_URL || "https://mesa-socio.vercel.app"}`);

  const texto = partes.join("\n");
  const curto = periodo === "manha"
    ? `${eventos.length} compromisso(s) · ${hoje.length} tarefa(s) pra hoje · ${atrasadas.length} atrasada(s) · ${(esperando?.length || 0) + (emails?.length || 0)} esperando você`
    : `${hoje.length + atrasadas.length} pendente(s) · amanhã: ${eventos.length} compromisso(s) · ${(esperando?.length || 0) + (emails?.length || 0)} esperando você`;
  return { texto, curto, titulo };
}
