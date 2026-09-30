import { NextRequest, NextResponse } from "next/server";
import { gerarDocx } from "@/lib/gerar-docx";
import { gerarPdf } from "@/lib/gerar-pdf";
import { logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 30;

// POST { titulo, texto, formato: "docx" | "pdf" } → arquivo Word ou PDF
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { titulo, texto, formato } = await req.json().catch(() => ({}));
  if (!texto) return NextResponse.json({ erro: "sem texto" }, { status: 400 });
  const pdf = formato === "pdf";
  const nome = String(titulo || "Documento").replace(/[\\/:*?"<>|]+/g, "").slice(0, 100) + (pdf ? ".pdf" : ".docx");
  const buf = pdf ? await gerarPdf(String(titulo || "Documento"), String(texto)) : await gerarDocx(String(titulo || "Documento"), String(texto));
  return new NextResponse(new Uint8Array(buf), { headers: {
    "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="${nome.normalize("NFD").replace(/[^\x20-\x7E]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
  } });
}
