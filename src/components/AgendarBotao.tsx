"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AgendarBotao({ id }: { id: string }) {
  const [estado, setEstado] = useState<"" | "indo" | "ok" | string>("");
  const router = useRouter();
  async function ir() {
    setEstado("indo");
    const j = await fetch("/api/tarefas/agendar", { method: "POST", body: JSON.stringify({ id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) setEstado(j.erro); else { setEstado("ok"); router.refresh(); }
  }
  if (estado === "ok") return <span className="small" style={{ color: "var(--verde)" }}>📅 na agenda</span>;
  return <>
    <button type="button" className="sec" onClick={ir} disabled={estado === "indo"}>{estado === "indo" ? "…" : "📅 Pôr na agenda"}</button>
    {estado && estado !== "indo" && <span className="small" style={{ color: "var(--vermelho)" }}>{estado}</span>}
  </>;
}
