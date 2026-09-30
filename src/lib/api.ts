import { NextResponse } from "next/server";
import { sbServer } from "./auth";
import { donoAtual } from "./contexto";

// Login: o middleware já conferiu no Supabase e assinou quem é — aqui só lê (rápido).
// Sem a assinatura (rotas fora do middleware), confere direto no Supabase.
export async function logado() {
  const d = donoAtual();
  if (d) return { email: d };
  const { data } = await sbServer().auth.getUser();
  return data.user;
}
export const naoAutorizado = () => NextResponse.json({ erro: "não autenticado" }, { status: 401 });
export const erro = (e: any, status = 500) => NextResponse.json({ erro: e?.message || String(e) }, { status });
