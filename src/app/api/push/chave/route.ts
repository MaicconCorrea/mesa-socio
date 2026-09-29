import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Chave pública (não é segredo) que o navegador precisa pra se inscrever
export async function GET() { return NextResponse.json({ chave: process.env.VAPID_PUBLIC_KEY || null }); }
