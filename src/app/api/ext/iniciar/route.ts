import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { naoLogado, usuarioDaExtensao } from "@/lib/ext-auth";
import { setoresDoUsuario } from "@/lib/setores";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const u = await usuarioDaExtensao(req); if (!u) return naoLogado();
  const { titulo, setor } = await req.json().catch(() => ({}));
  const setores = await setoresDoUsuario(u.email);
  if (!setores.length) return NextResponse.json({ erro: "Você ainda não está em nenhum grupo de setor no Google (dp@, fiscal@…). Peça ao Maiccon." }, { status: 403 });
  const escolhido = setores.find(s => s.codigo === setor) || setores[0];
  const { data, error } = await db().from("reunioes").insert({
    titulo: String(titulo || "Reunião gravada").slice(0, 200), data: new Date().toISOString(), origem: "gravada",
    setor: escolhido.codigo, autor_email: u.email, autor_nome: u.nome,
  }).select("id").single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, setor: escolhido, segundosPedaco: process.env.OPENAI_API_KEY ? 300 : 55 });
}
