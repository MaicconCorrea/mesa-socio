import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lerThread } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { nomeDoNumero } from "@/lib/numeros";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const normal = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// De onde a tarefa veio: as mensagens em volta do pedido (com a mensagem exata destacada), o e-mail ou a reunião
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const id = req.nextUrl.searchParams.get("id") || "";
  const sb = db();
  try {
    const { data: t } = await sb.from("tarefas").select("*").eq("id", id).single();
    if (!t) return NextResponse.json({ erro: "tarefa não encontrada" }, { status: 404 });

    if (t.conversa_id) {
      const [{ data: c }, { data: ms }] = await Promise.all([
        sb.from("conversas").select("id,nome,instancia,is_grupo").eq("id", t.conversa_id).single(),
        sb.from("mensagens").select("id,de_mim,autor,texto,enviada_em,transcricao").eq("conversa_id", t.conversa_id)
          .lte("enviada_em", new Date(new Date(t.criada_em).getTime() + 10 * 60000).toISOString())
          .order("enviada_em", { ascending: false }).limit(80),
      ]);
      const lista = (ms || []).reverse();
      // acha a mensagem do pedido: a que contém o trecho (ou a mais parecida); senão, a última antes da tarefa ser criada
      const trechos = String(t.trecho || "").split(/\s*\/\s*/).map(normal).filter(x => x.length > 3);
      let alvo = -1, melhor = 0;
      lista.forEach((m, i) => {
        const tx = normal(`${m.texto || ""} ${m.transcricao || ""}`);
        for (const tr of trechos) {
          if (tx.includes(tr)) { alvo = i; melhor = 1; return; }
          const palavras = tr.split(" ").filter(p => p.length > 3);
          const pts = palavras.length ? palavras.filter(p => tx.includes(p)).length / palavras.length : 0;
          if (pts > melhor && pts >= 0.5) { melhor = pts; alvo = i; }
        }
      });
      if (alvo < 0) alvo = lista.length - 1;
      const ini = Math.max(0, alvo - 5), fim = Math.min(lista.length, alvo + 4);
      return NextResponse.json({ tipo: "conversa",
        conversa: { id: c?.id, nome: c?.nome, grupo: c?.is_grupo, onde: c ? await nomeDoNumero(c.instancia) : "" },
        mensagens: lista.slice(ini, fim).map((m, k) => ({ ...m, destaque: ini + k === alvo, texto: m.transcricao ? `🎤 ${m.transcricao}` : m.texto })) });
    }
    if (t.email_thread_id) {
      const th = await lerThread(minhaConta(), t.email_thread_id);
      const ms = th.mensagens.slice(-3).map(m => ({
        de: m.de, deEmail: m.deEmail, data: m.data,
        texto: (m.texto ?? String(m.html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")).replace(/\s+/g, " ").trim().slice(0, 900),
      }));
      return NextResponse.json({ tipo: "email", assunto: th.assunto, threadId: th.id, mensagens: ms });
    }
    if (t.reuniao_id) {
      const { data: r } = await sb.from("reunioes").select("id,titulo,data,resumo").eq("id", t.reuniao_id).maybeSingle();
      return NextResponse.json({ tipo: "reuniao", reuniao: r });
    }
    return NextResponse.json({ tipo: "manual" });
  } catch (e) { return erro(e); }
}
