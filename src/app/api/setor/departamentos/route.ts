import { NextResponse } from "next/server";
import { listarDepartamentos } from "@/lib/acessorias";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
const PADRAO = [{ ID: "1", Nome: "Contábil" }, { ID: "2", Nome: "Fiscal" }, { ID: "3", Nome: "Pessoal" }, { ID: "5", Nome: "Legalização" }, { ID: "11", Nome: "Nota Fiscal" }];

export async function GET() {
  if (!(await logado())) return naoAutorizado();
  try { const d = await listarDepartamentos(); return NextResponse.json(Array.isArray(d) && d.length ? d : PADRAO); }
  catch { return NextResponse.json(PADRAO); }
}
