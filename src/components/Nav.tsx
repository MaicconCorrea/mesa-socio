"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sair } from "@/app/actions";

// Menu lateral igual ao do Painel DP: expandido/recolhido (Ctrl + .), gaveta no celular.
const GRUPOS: { titulo: string; itens: [string, string, string, string?][] }[] = [
  { titulo: "Meu dia", itens: [["/", "Hoje", "🏠"], ["/whatsapp", "WhatsApp", "💬"], ["/email", "E-mail", "✉️"], ["/agenda", "Agenda", "📅"], ["/resumo", "Resumo do dia", "☀️"]] },
  { titulo: "Em breve", itens: [["#reunioes", "Reuniões", "🎙️", "embreve"], ["#chat", "Google Chat", "🗨️", "embreve"]] },
  { titulo: "Sistema", itens: [["/config", "Configuração", "⚙️"]] },
];

export default function Nav({ email }: { email?: string }) {
  const p = usePathname();
  const [aberto, setAberto] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const [espiando, setEspiando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [n, setN] = useState<{ naoLidas: number; esperando: number; tarefasHoje: number; emails: number }>({ naoLidas: 0, esperando: 0, tarefasHoje: 0, emails: 0 });

  useEffect(() => { setAberto(false); setEspiando(false); }, [p]);
  useEffect(() => {
    let vivo = true;
    const ler = () => fetch("/api/menu/contagens").then(r => r.json()).then(j => { if (vivo && j) setN(j); }).catch(() => {});
    ler(); const t = setInterval(() => { if (document.visibilityState === "visible") ler(); }, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === ".") { e.preventDefault(); setRecolhido(r => !r); setEspiando(false); } };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, []);
  useEffect(() => { try { setRecolhido(localStorage.getItem("menu-recolhido") === "1"); } catch {} }, []);
  useEffect(() => {
    document.body.classList.toggle("menu-recolhido", recolhido);
    try { localStorage.setItem("menu-recolhido", recolhido ? "1" : "0"); } catch {}
  }, [recolhido]);

  const ativo = (href: string) => (href === "/" ? p === "/" : p.startsWith(href));
  const balao = (href: string) => {
    if (href === "/" && n.tarefasHoje) return <span className="bal" title="tarefas atrasadas ou de hoje">{n.tarefasHoje}</span>;
    if (href === "/whatsapp" && n.naoLidas) return <span className="bal verde" title="mensagens não lidas">{n.naoLidas > 99 ? "99+" : n.naoLidas}</span>;
    if (href === "/email" && n.emails) return <span className="bal" title="e-mails esperando resposta">{n.emails}</span>;
    return null;
  };
  const entrar = () => { if (!recolhido) return; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setEspiando(true), 220); };
  const sairMouse = () => { if (timer.current) clearTimeout(timer.current); setEspiando(false); };
  const IconePainel = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>;

  return (
    <>
      <div className="barra-topo">
        <button type="button" className="nav-hamburguer" aria-label="Abrir menu" onClick={() => setAberto(a => !a)}>{aberto ? "✕" : "☰"}</button>
        <Link href="/" className="marca-topo"><img src="/logo-branco.png" alt="Outtax" style={{ height: 22 }} /></Link>
      </div>
      {aberto && <div className="lateral-fundo" onClick={() => setAberto(false)} />}
      <aside className={"lateral" + (aberto ? " aberta" : "") + (recolhido && !espiando ? " recolhida" : "") + (recolhido && espiando ? " espiando" : "")} onMouseEnter={entrar} onMouseLeave={sairMouse}>
        <div className="lateral-cab">
          <Link href="/" className="lateral-marca"><img src="/logo-branco.png" alt="Outtax" /><span>Mesa do Sócio</span></Link>
          <button type="button" className="lateral-recolher" title={(recolhido ? "Fixar o menu aberto" : "Recolher menu") + " (Ctrl + .)"} onClick={() => { setRecolhido(r => !r); setEspiando(false); }}><IconePainel /></button>
        </div>
        <nav>
          {GRUPOS.map(g => (
            <div key={g.titulo} className="lateral-grupo">
              <div className="lateral-titulo">{g.titulo}</div>
              {g.itens.map(([href, rotulo, icone, extra]) => {
                const dentro = <><span className="lateral-icone">{icone}</span><span className="lateral-texto">{rotulo}</span>{balao(href)}</>;
                return extra === "embreve"
                  ? <a key={href} className="embreve" title="em breve">{dentro}</a>
                  : <Link key={href} href={href} className={ativo(href) ? "ativo" : ""} title={recolhido ? rotulo : undefined}>{dentro}</Link>;
              })}
            </div>
          ))}
        </nav>
        <div className="lateral-eu">
          <div className="lateral-texto"><b>Maiccon</b><span>{email || "sócio"}</span></div>
          <form action={sair}><button type="submit" title="Sair">{recolhido ? "⎋" : "sair"}</button></form>
        </div>
      </aside>
    </>
  );
}
