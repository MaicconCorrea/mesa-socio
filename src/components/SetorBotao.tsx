"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import MandarSetor from "./MandarSetor";

export default function SetorBotao({ tarefaId }: { tarefaId: string }) {
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return <>
    <button type="button" className="sec" onClick={() => setAberto(true)} title="Delegar ao setor (abre chamado no Acessórias)">➡️ Setor</button>
    {msg && <span className="small" style={{ color: "var(--verde)" }}>{msg}</span>}
    {aberto && <MandarSetor tarefaId={tarefaId} onFechar={(m) => { setAberto(false); if (m) { setMsg(m); router.refresh(); } }} />}
  </>;
}
