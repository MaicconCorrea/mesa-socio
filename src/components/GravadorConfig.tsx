"use client";
import { useState } from "react";

export default function GravadorConfig({ temChave, motor }: { temChave: boolean; motor: string }) {
  const [chave, setChave] = useState("");
  async function gerar() {
    if (temChave && !confirm("Gerar uma chave nova? A extensão vai precisar da chave nova (a antiga para de funcionar).")) return;
    const j = await fetch("/api/gravacao/chave", { method: "POST" }).then(r => r.json());
    setChave(j.chave || "");
  }
  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>Extensão do Chrome que grava <b>o som da aba da reunião + o seu microfone</b> (Meet, Zoom, Teams) e manda pra cá. Ao parar, a reunião aparece em <b>🎙️ Reuniões</b> já transcrita, resumida e com as tarefas.</p>
      <p className="small"><b>Transcrição:</b> {motor === "OpenAI" ? "🟢 OpenAI (pedaços de 5 min)" : motor === "nenhum" ? "🔴 desligada — coloque OPENAI_API_KEY na Vercel" : "🟡 Google (pedaços de 55 s) — com OPENAI_API_KEY fica melhor"}</p>
      <p className="small"><b>Chave da extensão:</b> {temChave ? "✅ já existe" : "ainda não criada"}</p>
      <button onClick={gerar}>{temChave ? "Gerar chave nova" : "Gerar chave"}</button>
      {chave && <div className="aviso" style={{ marginTop: 8 }}>Copie e cole na extensão (só aparece agora):<pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "6px 0 0" }}>{chave}</pre>
        <button className="mini" onClick={() => navigator.clipboard.writeText(chave)}>Copiar</button></div>}
    </div>
  );
}
