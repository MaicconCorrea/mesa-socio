import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analisarReuniao } from "@/lib/reunioes";
import { notificar } from "@/lib/push";
import { extensaoAutorizada, semChave } from "@/lib/gravador";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Parou de gravar: junta os pedaços, resume e cria as tarefas
export async function POST(req: NextRequest) {
  if (!(await extensaoAutorizada(req))) return semChave();
  const { id, titulo } = await req.json().catch(() => ({}));
  const sb = db();
  const { data: ps } = await sb.from("reuniao_pedacos").select("n,texto,erro").eq("reuniao_id", id).order("n");
  const texto = (ps || []).map(p => p.texto || (p.erro ? `[trecho ${p.n + 1} não transcrito]` : "")).filter(Boolean).join("\n");
  await sb.from("reunioes").update({ texto, ...(titulo ? { titulo: String(titulo).slice(0, 200) } : {}) }).eq("id", id);
  if (texto.replace(/\[trecho.*?\]/g, "").trim().length < 40) return NextResponse.json({ erro: "Quase nada foi transcrito. Confira se o som da aba e o microfone estavam liberados." }, { status: 400 });
  try {
    const r = await analisarReuniao(id);
    await notificar("🎙️ Reunião gravada e resumida", `${r.titulo} · ${r.criadas} tarefa(s)`, `/reunioes?r=${id}`, `re-${id}`).catch(() => {});
    return NextResponse.json({ ok: true, ...r, url: `/reunioes?r=${id}` });
  } catch (e: any) { return NextResponse.json({ erro: String(e?.message ?? e) }, { status: 500 }); }
}
