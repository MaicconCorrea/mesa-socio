import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { criarEvento } from "@/lib/agenda";
import { logado, naoAutorizado } from "@/lib/api";

// Põe uma tarefa (reunião ou prazo) na agenda: 30 min no horário do prazo, lembrete 10 min antes
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id } = await req.json().catch(() => ({}));
  const sb = db();
  const { data: t } = await sb.from("tarefas").select("*, conversas(nome,instancia)").eq("id", id).single();
  if (!t?.prazo) return NextResponse.json({ erro: "tarefa sem horário" }, { status: 400 });
  try {
    const ini = new Date(t.prazo), fim = new Date(ini.getTime() + 30 * 60000);
    const origem = t.conversas ? `WhatsApp ${t.conversas.nome} (${t.conversas.instancia})` : t.origem === "email" ? "e-mail" : "anotação";
    const ev = await criarEvento({
      titulo: t.tipo === "reuniao" ? t.titulo.replace(/^(Fazer|Participar de|Ter)\s+/i, "") : `⏰ ${t.titulo}`,
      inicio: ini.toISOString(), fim: fim.toISOString(),
      descricao: [t.detalhe, t.trecho ? `“${t.trecho}”` : null, `Criado pela Mesa do Sócio a partir de ${origem}.`].filter(Boolean).join("\n\n"),
    });
    await sb.from("tarefas").update({ evento_id: ev.id }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
