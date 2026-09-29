"use client";
import { useEffect, useState } from "react";
import { desligarPush, ligarPush, statusPush } from "@/lib/push-cliente";

const ITENS: [string, string][] = [
  ["push_whats", "💬 Mensagem nova no WhatsApp (conversas no privado)"],
  ["push_grupo_citado", "📣 Te citaram num grupo do escritório"],
  ["push_email", "✉️ E-mail de pessoa esperando você"],
  ["push_agenda", "📅 Reunião em 10 minutos"],
  ["push_prazo", "⏰ Prazo/promessa em 30 minutos"],
  ["push_tarefa_nova", "🤖 A IA criou uma tarefa"],
  ["silencio_noite", "🌙 Silêncio das 22h às 7h (só mensagens; agenda e prazos continuam)"],
];

export default function Avisos() {
  const [st, setSt] = useState("…");
  const [cfg, setCfg] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [resumo, setResumo] = useState("");
  useEffect(() => {
    statusPush().then(setSt);
    fetch("/api/config").then(r => r.json()).then(setCfg);
  }, []);
  async function salvar(p: any) { setCfg((c: any) => ({ ...c, ...p })); await fetch("/api/config", { method: "POST", body: JSON.stringify(p) }); }
  async function ligar() { setMsg(""); const e = await ligarPush(); setMsg(e || "Avisos ligados neste aparelho ✓"); setSt(await statusPush()); }
  async function testar() { const j = await fetch("/api/push/testar", { method: "POST" }).then(r => r.json()); setMsg(j.erro || `Teste enviado para ${j.enviadas} aparelho(s).`); }
  async function resumoAgora(periodo: string) {
    setResumo("Enviando…");
    const j = await fetch("/api/resumo/enviar", { method: "POST", body: JSON.stringify({ periodo }) }).then(r => r.json());
    setResumo(`Enviado por: ${j.feito?.join(", ") || "nenhum canal"}${j.erros?.length ? " · erros: " + j.erros.join("; ") : ""}`);
  }
  if (!cfg) return <p className="muted">Carregando…</p>;
  return (
    <>
      <div className="card">
        <b>Este aparelho:</b> {st === "ligado" ? "🟢 recebendo avisos" : st === "bloqueado" ? "🔴 avisos bloqueados no navegador" : st === "sem-suporte" ? "⚪ navegador sem suporte (no iPhone, instale a Mesa na tela inicial)" : "⚪ desligado"}
        <div className="acoes" style={{ marginTop: 8 }}>
          {st !== "ligado" ? <button onClick={ligar}>🔔 Ligar avisos neste aparelho</button> : <button className="sec" onClick={async () => { await desligarPush(); setSt(await statusPush()); }}>Desligar neste aparelho</button>}
          <button className="sec" onClick={testar}>Mandar aviso de teste</button>
        </div>
        {msg && <p className="small" style={{ marginTop: 6 }}>{msg}</p>}
        <p className="muted small" style={{ marginTop: 6 }}>Faça isso no computador <b>e</b> no celular (com a Mesa instalada na tela inicial).</p>
      </div>
      <div className="card">
        <b>O que avisar</b>
        {ITENS.map(([k, r]) => <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, margin: "6px 0" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={!!cfg[k]} onChange={e => salvar({ [k]: e.target.checked })} /> {r}</label>)}
      </div>
      <div className="card">
        <b>Resumo do dia</b> <span className="muted small">— dias úteis às 8h (seu dia) e 17:30 (fechamento + amanhã)</span>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, margin: "6px 0" }}><input type="checkbox" style={{ width: "auto" }} checked={!!cfg.resumo_push} onChange={e => salvar({ resumo_push: e.target.checked })} /> 🔔 Aviso no celular</label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, margin: "6px 0" }}><input type="checkbox" style={{ width: "auto" }} checked={!!cfg.resumo_email} onChange={e => salvar({ resumo_email: e.target.checked })} /> ✉️ E-mail pra você</label>
        <label style={{ fontWeight: 400 }}>💬 WhatsApp — número que recebe o resumo (vazio = não manda)
          <input defaultValue={cfg.resumo_whats_para} placeholder="21 97119-1200" onBlur={e => salvar({ resumo_whats_para: e.target.value })} /></label>
        <p className="muted small">Dica: coloque o seu número pessoal; o resumo sai de um dos números da Mesa e fica no seu WhatsApp.</p>
        <div className="acoes" style={{ marginTop: 6 }}>
          <a className="botao" href="/resumo">Ver o resumo agora</a>
          <button className="sec" onClick={() => resumoAgora("manha")}>Enviar o das 8h agora (teste)</button>
          <button className="sec" onClick={() => resumoAgora("tarde")}>Enviar o das 17:30 agora (teste)</button>
        </div>
        {resumo && <p className="small">{resumo}</p>}
      </div>
    </>
  );
}
