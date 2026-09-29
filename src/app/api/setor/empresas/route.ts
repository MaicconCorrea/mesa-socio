import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const sb = db();
  const { count } = await sb.from("empresas").select("cnpj", { count: "exact", head: true });
  if (!q) return NextResponse.json({ total: count || 0, empresas: [] });
  const dig = q.replace(/\D/g, "");
  const termo = q.replace(/[%,()]/g, " ").trim();
  let consulta = sb.from("empresas").select("cnpj,razao,fantasia").limit(15);
  consulta = dig.length >= 4 ? consulta.like("cnpj", `%${dig}%`) : consulta.or(`razao.ilike.%${termo}%,fantasia.ilike.%${termo}%`);
  const { data } = await consulta;
  return NextResponse.json({ total: count || 0, empresas: data || [] });
}
