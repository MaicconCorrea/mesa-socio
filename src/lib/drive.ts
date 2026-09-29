// Drive do Maiccon (somente leitura) — acha as anotações e transcrições do Google Meet (Gemini)
import { ESCOPOS, tokenGoogle } from "./google";

const API = "https://www.googleapis.com/drive/v3";
async function api(caminho: string) {
  const r = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${await tokenGoogle(ESCOPOS.drive)}` }, cache: "no-store" });
  if (!r.ok) {
    const t = await r.text();
    if (/has not been used|is disabled/i.test(t)) throw new Error("A Google Drive API não está ativa no projeto do Google Cloud da conta de serviço.");
    throw new Error(`Drive ${r.status}: ${t.slice(0, 200)}`);
  }
  return r;
}

export type DocReuniao = { id: string; nome: string; link: string; modificado: string; criado: string; tipo: "anotacoes" | "transcricao" };

export async function buscarDocsReuniao(dias = 14): Promise<DocReuniao[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const nomes = ["Anotações do Gemini", "Notes by Gemini", "Anotações da reunião", "Transcrição", "Transcript"];
  const q = `mimeType='application/vnd.google-apps.document' and trashed=false and modifiedTime > '${desde}' and (${nomes.map(n => `name contains '${n}'`).join(" or ")})`;
  const p = new URLSearchParams({ q, fields: "files(id,name,webViewLink,modifiedTime,createdTime)", orderBy: "createdTime desc", pageSize: "50",
    includeItemsFromAllDrives: "true", supportsAllDrives: "true", corpora: "allDrives" });
  const j = await (await api(`/files?${p}`)).json();
  return (j.files || []).map((f: any) => ({
    id: f.id, nome: f.name, link: f.webViewLink, modificado: f.modifiedTime, criado: f.createdTime,
    tipo: /transcri|transcript/i.test(f.name) && !/gemini/i.test(f.name) ? "transcricao" : "anotacoes",
  }));
}

export async function textoDoDoc(id: string): Promise<string> {
  const r = await api(`/files/${encodeURIComponent(id)}/export?mimeType=text/plain`);
  return (await r.text()).replace(/\r/g, "").trim();
}
