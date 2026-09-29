import { NextResponse } from "next/server";
import { sbServer } from "./auth";

export async function logado() {
  const { data } = await sbServer().auth.getUser();
  return data.user;
}
export const naoAutorizado = () => NextResponse.json({ erro: "não autenticado" }, { status: 401 });
export const erro = (e: any, status = 500) => NextResponse.json({ erro: e?.message || String(e) }, { status });
