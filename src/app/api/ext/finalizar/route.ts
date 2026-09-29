import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analisarReuniao } from "@/lib/reunioes";
import { naoLogado, usuarioDaExtensao } from "@/lib/ext-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const u = await usuarioDaExtensao(req); if (!u) return naoLogado();
  const { id, titulo } = await req.json().catch(() => ({}));
  const sb = db();
  const { data: r } = await sb.from("reunioes").select("autor_email,setor").eq("id", id).single();
  if (!r || r.autor_email !== u.email) return NextResponse.json({ erro: "reunião não é sua" }, { status: 403 });
  const { data: ps } = await sb.from("reuniao_pedacos").select("n,texto,erro").eq("reuniao_id", id).order("n");
  const texto = (ps || []).map(p => p.texto || (p.erro ? `[trecho ${p.n + 1} não transcrito]` : "")).filter(Boolean).join("\n");
  await sb.from("reunioes").update({ texto, ...(titulo ? { titulo: String(titulo).slice(0, 200) } : {}) }).eq("id", id);
  if (texto.replace(/\[trecho.*?\]/g, "").trim().length < 40) return NextResponse.json({ erro: "Quase nada foi transcrito. Confira se o som da aba e o microfone estavam liberados." }, { status: 400 });
  try {
    const x = await analisarReuniao(id);
    return NextResponse.json({ ok: true, ...x, setor: r.setor });
  } catch (e: any) { return NextResponse.json({ erro: String(e?.message ?? e) }, { status: 500 }); }
}
