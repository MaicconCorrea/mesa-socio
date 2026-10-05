import { NextResponse } from "next/server";
import { origemNova } from "@/lib/mudou";
export const dynamic = "force-dynamic";
// Público: o ID do cliente OAuth que a extensão usa pra entrar com o Google (não é segredo)
export async function GET() {
  // mudouPara: endereço novo da Mesa (virada para o portal) — a extensão v2.1+ passa a usá-lo sozinha
  return NextResponse.json({ clientId: (process.env.EXT_OAUTH_CLIENT_ID || "").split(",")[0].trim() || null, mudouPara: origemNova() }, { headers: { "Access-Control-Allow-Origin": "*" } });
}
