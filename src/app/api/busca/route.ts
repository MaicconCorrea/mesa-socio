import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { donoAtual } from "@/lib/contexto";
import { logado, naoAutorizado } from "@/lib/api";
import { listarThreads } from "@/lib/gmail";
import { googleConfigurado, minhaConta } from "@/lib/google";
import { meusNumeros } from "@/lib/numeros";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Pesquisa da tela Hoje: tarefas, e-mails e conversas do sócio logado.
// db() já filtra pelo dono (cabeçalho assinado pelo middleware); sem dono não busca nada.
// GET /api/busca?q=termo&tarefas=abertas|todas&gmail=0 (gmail=0 = só o banco, usado na atualização automática)

const LIMITE = 30;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Palavras da busca (no máximo 4), sem caracteres que quebram o filtro do PostgREST
function palavras(q: string): string[] {
  const limpo = q.replace(/[^\p{L}\p{N}@.\-+/ ]+/gu, " ").toLowerCase();
  return Array.from(new Set(limpo.split(/\s+/).filter(w => w.length >= 2))).slice(0, 4);
}

// ilike não ignora acento: tenta a palavra como veio, sem acento e com as terminações mais comuns (ção, ções, ões, ão)
function variantes(w: string): string[] {
  const base = semAcento(w);
  const v = new Set([w, base]);
  if (base.endsWith("cao")) v.add(base.slice(0, -3) + "ção");
  else if (base.endsWith("coes")) v.add(base.slice(0, -4) + "ções");
  else if (base.endsWith("oes")) v.add(base.slice(0, -3) + "ões");
  else if (base.endsWith("ao")) v.add(base.slice(0, -2) + "ão");
  return Array.from(v);
}

const ou = (cols: string[], w: string, extra: string[] = []) =>
  [...cols.flatMap(c => variantes(w).map(v => `${c}.ilike."%${v}%"`)), ...extra].join(",");

async function comPrazo<T>(p: Promise<T>, ms: number, padrao: T): Promise<T> {
  let tm: any;
  const r = await Promise.race([p, new Promise<T>(res => { tm = setTimeout(() => res(padrao), ms); })]).catch(() => padrao);
  clearTimeout(tm);
  return r;
}

export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  if (!donoAtual()) return naoAutorizado(); // sem dono o db() não filtraria — nunca busca no geral
  const sp = req.nextUrl.searchParams;
  const q = String(sp.get("q") || "").slice(0, 120).trim();
  const ws = palavras(q);
  if (!ws.length) return NextResponse.json({ q, tarefas: [], emails: [], conversas: [] });
  const soAbertas = sp.get("tarefas") !== "todas";
  const comGmail = sp.get("gmail") !== "0" && googleConfigurado();
  const sb = db();

  try {
    // ---- Tarefas: título, detalhe, quem, trecho citado e nome do contato/conversa ----
    const convPorPalavra = await Promise.all(ws.map(async w => {
      const { data } = await sb.from("conversas").select("id").or(ou(["nome"], w)).limit(50);
      return (data || []).map((c: any) => c.id as string);
    }));
    let qt = sb.from("tarefas").select("*, conversas(nome,instancia)");
    ws.forEach((w, i) => {
      const ids = convPorPalavra[i];
      qt = qt.or(ou(["titulo", "detalhe", "quem", "trecho"], w, ids.length ? [`conversa_id.in.(${ids.join(",")})`] : []));
    });
    if (soAbertas) qt = qt.eq("status", "aberta");
    const pTarefas = qt.order("criada_em", { ascending: false }).limit(LIMITE);

    // ---- E-mails guardados na Mesa: assunto, remetente, resumo da IA ----
    let qe = sb.from("email_threads").select("thread_id,assunto,de,de_email,recebido_em,status,esperando,resumo");
    ws.forEach(w => { qe = qe.or(ou(["assunto", "de", "de_email", "resumo"], w)); });
    const pEmails = qe.order("recebido_em", { ascending: false, nullsFirst: false }).limit(LIMITE);

    // ---- Gmail (corpo dos e-mails, ignora acento; fora spam/lixeira): só os 10 mais recentes, com prazo curto ----
    const pGmail = comGmail
      ? comPrazo(listarThreads(minhaConta(), ws.map(w => w.replace(/^[-+]+/, "")).filter(Boolean).map(w => `"${w}"`).join(" "), undefined, 10).then(r => r.threads), 8000, [] as any[])
      : Promise.resolve([] as any[]);

    // ---- Conversas (WhatsApp/Google Chat): nome, resumo da IA e mensagens ----
    let qc = sb.from("conversas").select("id,nome,instancia,is_grupo,resumo,ultima_msg_texto,ultima_msg_em");
    ws.forEach(w => { qc = qc.or(ou(["nome", "resumo", "ultima_msg_texto"], w)); });
    const pConv = qc.order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(15);
    let qm = sb.from("mensagens").select("conversa_id,texto,enviada_em,de_mim,autor,conversas(nome,instancia,is_grupo)");
    ws.forEach(w => { qm = qm.or(ou(["texto"], w)); });
    const pMsgs = qm.order("enviada_em", { ascending: false }).limit(LIMITE);

    const [rt, re, gmail, rc, rm, numeros] = await Promise.all([pTarefas, pEmails, pGmail, pConv, pMsgs, meusNumeros(true).catch(() => [])]);
    if (rt.error) throw new Error(rt.error.message);
    if (re.error) throw new Error(re.error.message);

    // e-mails: os da Mesa + os que só o Gmail achou (pelo corpo)
    const emails: any[] = (re.data || []).map((e: any) => ({ ...e, fonte: "mesa" }));
    const ja = new Set(emails.map(e => e.thread_id));
    const faltam = (gmail || []).filter((t: any) => t && !ja.has(t.id));
    if (faltam.length) {
      // pode ser um e-mail que a Mesa guarda mas não bateu no assunto/resumo: traz a situação de lá
      const { data: st } = await sb.from("email_threads").select("thread_id,status,esperando,resumo").in("thread_id", faltam.map((t: any) => t.id));
      const porId = new Map((st || []).map((s: any) => [s.thread_id, s]));
      for (const t of faltam) {
        const s: any = porId.get(t.id);
        emails.push({ thread_id: t.id, assunto: t.assunto, de: t.de, de_email: t.deEmail, recebido_em: t.quando, snippet: t.snippet,
          status: s?.status || null, esperando: !!s?.esperando, resumo: s?.resumo || null, fonte: s ? "mesa" : "gmail" });
      }
    }
    emails.sort((a, b) => new Date(b.recebido_em || 0).getTime() - new Date(a.recebido_em || 0).getTime());

    // conversas: uma linha por conversa, com a mensagem mais recente que bateu
    const nomeNum = Object.fromEntries((numeros as any[]).map(n => [n.instancia, n.nome]));
    const canal = (i: string) => i === "gchat" ? "Google Chat" : (nomeNum[i] || String(i || "").replace(/^socio-/, ""));
    const porConv = new Map<string, any>();
    for (const m of rm.data || []) {
      if (porConv.has(m.conversa_id) || !m.conversas) continue;
      porConv.set(m.conversa_id, { id: m.conversa_id, nome: m.conversas.nome, canal: canal(m.conversas.instancia), is_grupo: m.conversas.is_grupo,
        trecho: m.texto, autor: m.de_mim ? "Você" : m.autor, em: m.enviada_em });
    }
    for (const c of rc.data || []) {
      if (porConv.has(c.id)) continue;
      porConv.set(c.id, { id: c.id, nome: c.nome, canal: canal(c.instancia), is_grupo: c.is_grupo, trecho: c.resumo || c.ultima_msg_texto, autor: c.resumo ? "🤖" : null, em: c.ultima_msg_em });
    }
    const conversas = Array.from(porConv.values()).sort((a, b) => new Date(b.em || 0).getTime() - new Date(a.em || 0).getTime()).slice(0, LIMITE);

    return NextResponse.json({ q, palavras: ws, tarefas: rt.data || [], emails: emails.slice(0, LIMITE), conversas, gmail: comGmail });
  } catch (e: any) {
    return NextResponse.json({ erro: String(e?.message || e) }, { status: 500 });
  }
}
