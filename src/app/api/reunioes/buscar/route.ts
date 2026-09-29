import { NextResponse } from "next/server";
import { importarReunioes } from "@/lib/reunioes";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 300;

export async function POST() {
  if (!(await logado())) return naoAutorizado();
  try { return NextResponse.json({ ok: true, ...(await importarReunioes(4)) }); } catch (e) { return erro(e); }
}
