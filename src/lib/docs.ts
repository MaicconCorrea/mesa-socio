// Documentos anexados às tarefas: guardados no Supabase Storage (bucket mesa-docs) e lidos pela IA
import { dbGlobal } from "./db";

export const BUCKET = "mesa-docs";

export async function linkParaSubir(caminho: string) {
  const { data, error } = await dbGlobal().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error || !data) throw new Error("Não consegui preparar o envio do arquivo: " + (error?.message || ""));
  return data.signedUrl;
}

export async function baixarDoc(caminho: string): Promise<Buffer> {
  const { data, error } = await dbGlobal().storage.from(BUCKET).download(caminho);
  if (error || !data) throw new Error("Arquivo não encontrado: " + (error?.message || caminho));
  return Buffer.from(await data.arrayBuffer());
}

export async function apagarDoc(caminho: string) { await dbGlobal().storage.from(BUCKET).remove([caminho]); }

// Transforma os documentos em "blocos" que a IA consegue ler (PDF e imagem direto; Word e texto viram texto)
export async function blocosParaIA(docs: { nome: string; mime: string | null; caminho: string }[]) {
  const blocos: any[] = [];
  for (const d of docs) {
    const mime = (d.mime || "").toLowerCase(); const nome = d.nome.toLowerCase();
    try {
      const bytes = await baixarDoc(d.caminho);
      if (mime.includes("pdf") || nome.endsWith(".pdf")) {
        blocos.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") }, title: d.nome });
      } else if (/^image\/(png|jpe?g|gif|webp)$/.test(mime)) {
        blocos.push({ type: "text", text: `Imagem anexada: ${d.nome}` });
        blocos.push({ type: "image", source: { type: "base64", media_type: mime === "image/jpg" ? "image/jpeg" : mime, data: bytes.toString("base64") } });
      } else if (nome.endsWith(".docx") || mime.includes("wordprocessingml")) {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ buffer: bytes });
        blocos.push({ type: "text", text: `Documento Word "${d.nome}":\n${value.slice(0, 120000)}` });
      } else if (mime.startsWith("text/") || /\.(txt|csv|md)$/.test(nome)) {
        blocos.push({ type: "text", text: `Arquivo "${d.nome}":\n${bytes.toString("utf8").slice(0, 120000)}` });
      } else {
        blocos.push({ type: "text", text: `(Arquivo "${d.nome}" anexado, mas esse formato não dá pra ler — prefira PDF, Word, imagem ou texto.)` });
      }
    } catch (e: any) { blocos.push({ type: "text", text: `(Não consegui abrir "${d.nome}": ${e?.message || e})` }); }
  }
  return blocos;
}
