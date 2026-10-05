"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { exigirLogin, sbServer } from "@/lib/auth";
import { donoAtual } from "@/lib/contexto";
import { analisarConversa, analisarPendentes } from "@/lib/analise";
import { ligarWebhook as ligarWebhookEvo } from "@/lib/evolution";

function atualizar() {
  revalidatePath("/");
  revalidatePath("/conversas");
  revalidatePath("/config");
}

// Mesma gravação para o botão do cartão (1 tarefa) e para a seleção em lote (várias).
// db() já filtra pelo dono logado: tarefa de outro sócio simplesmente não é tocada.
async function mudarStatusTarefas(ids: string[], status: "feita" | "descartada") {
  const { data, error } = await db().from("tarefas").update({ status, concluida_em: new Date().toISOString() }).in("id", ids).select("id");
  return { n: (data || []).length, erro: error?.message as string | undefined };
}

export async function concluirTarefa(fd: FormData) {
  await exigirLogin();
  await mudarStatusTarefas([String(fd.get("id"))], "feita");
  atualizar();
}

export async function descartarTarefa(fd: FormData) {
  await exigirLogin();
  await mudarStatusTarefas([String(fd.get("id"))], "descartada");
  atualizar();
}

// ---- Seleção em lote (tela Hoje) ----
const LOTE_MAX = 200;
export type ResultadoLote = { ok: boolean; n?: number; erro?: string };

function idsDoLote(v: unknown): string[] {
  if (!Array.isArray(v)) throw new Error("Seleção inválida.");
  const ids = Array.from(new Set(v.map(x => String(x ?? "").trim()).filter(s => /^[0-9A-Za-z-]{1,64}$/.test(s))));
  if (!ids.length) throw new Error("Nenhuma tarefa selecionada.");
  if (ids.length > LOTE_MAX) throw new Error(`No máximo ${LOTE_MAX} tarefas por vez.`);
  return ids;
}

// Em lote, exige o dono assinado pelo middleware (x-mesa-dono + assinatura): sem ele o db() não filtraria.
async function exigirDonoDoLote() {
  await exigirLogin();
  const d = donoAtual();
  if (!d) throw new Error("Não deu para confirmar de quem são as tarefas. Entre de novo.");
  return d;
}

async function statusEmLote(ids: unknown, status: "feita" | "descartada"): Promise<ResultadoLote> {
  try {
    await exigirDonoDoLote();
    const r = await mudarStatusTarefas(idsDoLote(ids), status);
    if (r.erro) return { ok: false, erro: r.erro };
    atualizar();
    return { ok: true, n: r.n };
  } catch (e: any) { return { ok: false, erro: String(e?.message || e) }; }
}

export async function concluirTarefasLote(ids: string[]): Promise<ResultadoLote> { return statusEmLote(ids, "feita"); }
export async function descartarTarefasLote(ids: string[]): Promise<ResultadoLote> { return statusEmLote(ids, "descartada"); }

const horaSP = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

// Novo dia de prazo para várias tarefas: mantém o horário que cada uma já tinha (sem horário → 18:00)
export async function mudarPrazoTarefasLote(ids: string[], dia: string): Promise<ResultadoLote> {
  try {
    await exigirDonoDoLote();
    const lista = idsDoLote(ids);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia)) || isNaN(new Date(`${dia}T12:00:00-03:00`).getTime())) throw new Error("Data inválida.");
    const sb = db();
    const { data: atuais, error } = await sb.from("tarefas").select("id, prazo").in("id", lista);
    if (error) throw new Error(error.message);
    const porHora = new Map<string, string[]>();
    for (const t of atuais || []) {
      const hm = t.prazo ? horaSP(t.prazo) : "18:00";
      porHora.set(hm, [...(porHora.get(hm) || []), t.id]);
    }
    let n = 0;
    for (const [hm, grupo] of Array.from(porHora.entries())) {
      const { data: up, error: e2 } = await sb.from("tarefas").update({ prazo: new Date(`${dia}T${hm}:00-03:00`).toISOString() }).in("id", grupo).select("id");
      if (e2) throw new Error(e2.message);
      n += (up || []).length;
    }
    atualizar();
    return { ok: true, n };
  } catch (e: any) { return { ok: false, erro: String(e?.message || e) }; }
}

export async function reabrirTarefa(fd: FormData) {
  await exigirLogin();
  await db().from("tarefas").update({ status: "aberta", concluida_em: null }).eq("id", String(fd.get("id")));
  atualizar();
}

export async function criarTarefa(fd: FormData) {
  await exigirLogin();
  const titulo = String(fd.get("titulo") || "").trim();
  if (!titulo) return;
  const prazoTxt = String(fd.get("prazo") || "");
  const h = headers();
  const dono = h.get("x-mesa-dono") || "";
  await db().from("tarefas").insert({
    titulo,
    tipo: String(fd.get("tipo") || "outro"),
    categoria: String(fd.get("categoria") || "trabalho") === "pessoal" ? "pessoal" : "trabalho",
    quem: String(fd.get("quem") || "") || null,
    detalhe: String(fd.get("detalhe") || "") || null,
    prazo: prazoTxt ? new Date(`${prazoTxt}:00-03:00`).toISOString() : null,
    origem: "manual",
    ...(dono ? { dono } : {}),
  });
  atualizar();
}

export async function jaRespondi(fd: FormData) {
  await exigirLogin();
  await db().from("conversas").update({ precisa_resposta: false }).eq("id", String(fd.get("id")));
  atualizar();
}

export async function ignorarConversa(fd: FormData) {
  await exigirLogin();
  const id = String(fd.get("id"));
  const sb = db();
  await sb.from("conversas").update({
    modo: "ignorada", ignorada: true, precisa_resposta: false, pendente_ia: false,
    sem_retorno: false, checar_parado: false, resumo: null,
  }).eq("id", id);
  await sb.from("mensagens").delete().eq("conversa_id", id); // privacidade: apaga o que já tinha
  await sb.from("tarefas").update({ status: "descartada" }).eq("conversa_id", id).eq("status", "aberta");
  atualizar();
}

export async function definirModo(fd: FormData) {
  await exigirLogin();
  const id = String(fd.get("id"));
  const modo = String(fd.get("modo"));
  if (modo === "ignorada") return ignorarConversa(fd);
  if (!["auto", "pessoal", "grupo"].includes(modo)) return;
  const upd: any = { modo, ignorada: false };
  if (modo === "pessoal") { upd.precisa_resposta = false; upd.sem_retorno = false; upd.checar_parado = false; }
  if (modo !== "grupo") { upd.sem_retorno = false; upd.checar_parado = false; }
  await db().from("conversas").update(upd).eq("id", id);
  atualizar();
}

export async function voltarAcompanhar(fd: FormData) {
  await exigirLogin();
  const id = String(fd.get("id"));
  const { data: c } = await db().from("conversas").select("is_grupo").eq("id", id).single();
  await db().from("conversas").update({ ignorada: false, modo: c?.is_grupo ? "grupo" : "auto" }).eq("id", id);
  atualizar();
}

export async function grupoResolvido(fd: FormData) {
  await exigirLogin();
  await db().from("conversas").update({ sem_retorno: false, checar_parado: false }).eq("id", String(fd.get("id")));
  atualizar();
}

export async function reanalisar(fd: FormData) {
  await exigirLogin();
  const id = String(fd.get("id"));
  await db().from("conversas").update({ analisada_em: null }).eq("id", id);
  await analisarConversa(id);
  atualizar();
}

export async function analisarAgora() {
  await exigirLogin();
  await analisarPendentes(15);
  atualizar();
}

export async function ligarWebhook(fd: FormData) {
  await exigirLogin();
  const inst = String(fd.get("instancia"));
  const host = headers().get("x-forwarded-host") || headers().get("host");
  const url = `https://${host}/api/webhook/evolution?secret=${encodeURIComponent(process.env.WEBHOOK_SECRET || "")}`;
  const r = await ligarWebhookEvo(inst, url);
  revalidatePath("/config");
  redirect(`/config?msg=${encodeURIComponent(r.ok ? `Webhook ligado em ${inst}` : `Falhou em ${inst}: ${r.detalhe}`)}`);
}

export async function sair() {
  await sbServer().auth.signOut();
  redirect("/login");
}
