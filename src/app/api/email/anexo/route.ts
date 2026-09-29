import { NextRequest, NextResponse } from "next/server";
import { baixarAnexo } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { logado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await logado())) return new NextResponse("não autenticado", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const nome = (sp.get("nome") || "anexo").replace(/["\r\n]/g, "");
  try {
    const bytes = await baixarAnexo(minhaConta(), sp.get("msg") || "", sp.get("att") || "");
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": sp.get("mime") || "application/octet-stream",
      "Content-Disposition": `${sp.get("baixar") ? "attachment" : "inline"}; filename="${nome.normalize("NFD").replace(/[^\x20-\x7E]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    } });
  } catch (e: any) { return new NextResponse(e.message, { status: 500 }); }
}
