"use client";
import { useEffect, useState } from "react";

const hm = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

// Bloco "Agenda de hoje" da tela Hoje
export default function AgendaHoje() {
  const [evs, setEvs] = useState<any[] | null>(null);
  const [erro, setErro] = useState("");
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const ler = () => fetch("/api/agenda/eventos?dias=1").then(r => r.json()).then(j => {
      if (j.ativo === false) { setErro("Agenda ainda não ligada (ver Configuração)."); setEvs([]); return; }
      setErro(j.erro || ""); setEvs(j.eventos || []);
    }).catch(() => setEvs([]));
    ler(); const t = setInterval(() => { setAgora(Date.now()); ler(); }, 120000);
    return () => clearInterval(t);
  }, []);
  if (evs === null) return <div className="vazio">Carregando agenda…</div>;
  if (erro) return <div className="aviso small">{erro}</div>;
  const restantes = evs.filter(e => new Date(e.fim).getTime() > agora);
  if (!restantes.length) return <div className="vazio">Nada mais na agenda hoje.</div>;
  return <>{restantes.map(e => {
    const ja = new Date(e.inicio).getTime() <= agora;
    const falta = Math.round((new Date(e.inicio).getTime() - agora) / 60000);
    return <div key={e.id} className="card" style={{ padding: "8px 12px" }}>
      <div className="linha"><span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", flex: "none", alignSelf: "center", marginRight: 6, background: ja ? "var(--verde)" : falta <= 30 ? "var(--laranja)" : "var(--azul)" }} /><b style={{ color: "var(--navy)" }}>{e.diaInteiro ? "Dia inteiro" : `${hm(e.inicio)}–${hm(e.fim)}`}</b>
        <span className="titulo" style={{ fontWeight: 500 }}>{e.titulo}</span></div>
      <div className="meta">{ja ? "acontecendo agora" : !e.diaInteiro && falta <= 60 ? `começa em ${falta} min` : ""}
        {e.meet ? <> · <a href={e.meet} target="_blank">🎥 entrar no Meet</a></> : null}
        {e.minhaResposta === "needsAction" ? " · ⏳ convite sem resposta" : ""}</div>
    </div>;
  })}</>;
}
