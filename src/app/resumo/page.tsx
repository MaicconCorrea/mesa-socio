import { montarResumo } from "@/lib/resumo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resumo · Mesa do Sócio" };

export default async function Resumo({ searchParams }: { searchParams: { p?: string } }) {
  const periodo = searchParams.p === "tarde" ? "tarde" : new Date().getUTCHours() >= 18 ? "tarde" : "manha";
  const r = await montarResumo(periodo);
  const html = r.texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*(.+?)\*/g, "<b>$1</b>").replace(/(https?:\/\/\S+)/g, '<a href="/">abrir a Mesa</a>');
  return (
    <>
      <div className="abas"><a href="/resumo?p=manha" className={periodo === "manha" ? "ativa" : ""}>☀️ 8h</a><a href="/resumo?p=tarde" className={periodo === "tarde" ? "ativa" : ""}>🌙 17:30</a></div>
      <div className="card" style={{ whiteSpace: "pre-wrap", maxWidth: 640, fontSize: 14, lineHeight: 1.55, marginTop: 10 }} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
