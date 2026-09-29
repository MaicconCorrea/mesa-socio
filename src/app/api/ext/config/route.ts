import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Público: o ID do cliente OAuth que a extensão usa pra entrar com o Google (não é segredo)
export async function GET() {
  return NextResponse.json({ clientId: (process.env.EXT_OAUTH_CLIENT_ID || "").split(",")[0].trim() || null }, { headers: { "Access-Control-Allow-Origin": "*" } });
}
