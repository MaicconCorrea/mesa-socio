import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extensaoAutorizada, semChave } from "@/lib/gravador";

export const dynamic = "force-dynamic";

// A extensão começa a gravar: cria a reunião e diz o tamanho de cada pedaço
export async function POST(req: NextRequest) {
  if (!(await extensaoAutorizada(req))) return semChave();
  const { titulo } = await req.json().catch(() => ({}));
  const { data, error } = await db().from("reunioes").insert({
    titulo: String(titulo || "Reunião gravada").slice(0, 200), data: new Date().toISOString(), origem: "gravada", texto: null,
  }).select("id").single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  // OpenAI transcreve pedaços grandes; o Google só até 1 min
  return NextResponse.json({ id: data.id, segundosPedaco: process.env.OPENAI_API_KEY ? 300 : 55 });
}
