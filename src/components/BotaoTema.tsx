"use client";
import { useEffect, useState } from "react";

// Botão do modo noturno (design system Outtax). A escolha fica salva neste navegador;
// na primeira visita segue o sistema operacional (script no <head> do layout).
export default function BotaoTema({ curto, claroFundo }: { curto?: boolean; claroFundo?: boolean }) {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => { setEscuro(document.documentElement.dataset.theme === "escuro"); }, []);
  function trocar() {
    const novo = !escuro;
    setEscuro(novo);
    document.documentElement.dataset.theme = novo ? "escuro" : "claro";
    try { localStorage.setItem("tema", novo ? "escuro" : "claro"); } catch {}
  }
  const rotulo = escuro ? "Claro" : "Noturno";
  return (
    <button type="button" onClick={trocar} aria-pressed={escuro} title={escuro ? "Mudar para o modo claro" : "Mudar para o modo noturno"} className={"botao-tema" + (claroFundo ? " claro-fundo" : "")}>
      {escuro ? (
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A5.5 5.5 0 0 1 5.8 2.5a5.5 5.5 0 1 0 7.7 7.7z" /></svg>
      )}
      {curto ? null : <span>{rotulo}</span>}
    </button>
  );
}
