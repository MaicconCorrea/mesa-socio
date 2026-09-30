import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizar } from "@/lib/analise";
import { donoAtual } from "@/lib/contexto";
import { erro, logado, naoAutorizado } from "@/lib/api";

// Tarefa combinada numa reunião de setor → tarefa na SUA Mesa (pra acompanhar/cobrar).
// { id, indice } cria uma; { id, todas: true } cria todas. Devolve os ids (índice → id da tarefa).
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, indice, todas } = await req.json().catch(() => ({}));
  const sb = db();
  try {
    const { data: r } = await sb.from("reunioes").select("id,titulo,tarefas_equipe,resumo").eq("id", id).single();
    if (!r) return NextResponse.json({ erro: "reunião não encontrada" }, { status: 404 });
    const itens: any[] = r.tarefas_equipe || [];
    const alvo = todas ? itens.map((_, i) => i) : [Number(indice)];
    const ids: Record<number, string> = {};
    for (const i of alvo) {
      const t = itens[i]; if (!t?.titulo) continue;
      const marca = `equipe:${t.titulo}`;
      const { data: ja } = await sb.from("tarefas").select("id").eq("reuniao_id", id).eq("trecho", marca).maybeSingle();
      if (ja) { ids[i] = ja.id; continue; }
      const prazo = t.prazo && !isNaN(new Date(t.prazo).getTime()) ? new Date(t.prazo).toISOString() : null;
      const { data: nova, error } = await sb.from("tarefas").insert({
        reuniao_id: id, tipo: "outro", categoria: "trabalho", origem: "reuniao", status: "aberta",
        titulo: `Cobrar ${t.quem || "equipe"}: ${t.titulo}`.slice(0, 200), quem: t.quem || null, prazo, trecho: marca,
        detalhe: `Combinado na reunião: ${r.titulo}`,
        hash: `reuniao|${id}|equipe|${donoAtual() || ""}|${normalizar(t.titulo)}`,
      }).select("id").single();
      if (error) throw new Error(error.message);
      ids[i] = nova.id;
    }
    return NextResponse.json({ ok: true, ids });
  } catch (e) { return erro(e); }
}
