import { NextRequest, NextResponse } from "next/server";
import { naoLogado, usuarioDaExtensao } from "@/lib/ext-auth";
import { setoresDoUsuario } from "@/lib/setores";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = await usuarioDaExtensao(req); if (!u) return naoLogado();
  try {
    const setores = await setoresDoUsuario(u.email);
    return NextResponse.json({ email: u.email, nome: u.nome, setores, transcricao: process.env.OPENAI_API_KEY ? "openai" : "google" });
  } catch (e: any) { return NextResponse.json({ erro: e.message }, { status: 500 }); }
}
