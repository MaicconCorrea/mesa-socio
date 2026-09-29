"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { exigirLogin, sbServer } from "@/lib/auth";
import { analisarConversa, analisarPendentes } from "@/lib/analise";
import { ligarWebhook as ligarWebhookEvo } from "@/lib/evolution";

function atualizar() {
  revalidatePath("/");
  revalidatePath("/conversas");
  revalidatePath("/config");
}

export async function concluirTarefa(fd: FormData) {
  await exigirLogin();
  await db().from("tarefas").update({ status: "feita", concluida_em: new Date().toISOString() }).eq("id", String(fd.get("id")));
  atualizar();
}

export async function descartarTarefa(fd: FormData) {
  await exigirLogin();
  await db().from("tarefas").update({ status: "descartada", concluida_em: new Date().toISOString() }).eq("id", String(fd.get("id")));
  atualizar();
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
  await db().from("tarefas").insert({
    titulo,
    tipo: String(fd.get("tipo") || "outro"),
    categoria: String(fd.get("categoria") || "trabalho") === "pessoal" ? "pessoal" : "trabalho",
    quem: String(fd.get("quem") || "") || null,
    detalhe: String(fd.get("detalhe") || "") || null,
    prazo: prazoTxt ? new Date(`${prazoTxt}:00-03:00`).toISOString() : null,
    origem: "manual",
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
