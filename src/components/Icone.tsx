// Ícones de traço do design system Outtax (iguais nos 6 painéis).
// Uso: <Icone nome="casa" />  — herda a cor do texto (currentColor). Tamanho padrão 18px.
const P: Record<string, string> = {
  casa: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  kanban: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  pino: '<path d="M12 17v5"/><path d="M8 3h8l-1 6 3 3H6l3-3z"/>',
  conversa: '<path d="M4 5h16v11H9l-5 4z"/>',
  envio: '<path d="M4 4h16v16H4z"/><path d="M4 9l8 5 8-5"/>',
  foguete: '<path d="M5 15c-1 2-1 4-1 5 1 0 3 0 5-1"/><path d="M9 15l-2-2c2-6 6-9 12-9 0 6-3 10-9 12z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M8 18h2M12 18h4"/>',
  arquivo: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  predio: '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9 21v-5h6v5"/>',
  balanca: '<path d="M12 4v16M7 20h10M4 8h16"/><path d="M6 8l-3 6a3 3 0 006 0zM18 8l-3 6a3 3 0 006 0z"/>',
  moeda: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6v2M12 16v2"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chat: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  grafico: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  tendencia: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  relogio: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  pessoas: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 5a3 3 0 010 6M18 14c2 .7 3 2.8 3 6"/>',
  megafone: '<path d="M3 10v4l11 5V5z"/><path d="M14 9a3 3 0 010 6M6 15l1 5h3l-1-4"/>',
  pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  bandeja: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  entrar: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3-7 7-7M17 14v6M14 17h6"/>',
  sairp: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3-7 7-7M14 17h6"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
  folha: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  caixa: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  numero: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
  carteira: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>',
  ciclo: '<path d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/>',
  ferramenta: '<path d="M14 6a4 4 0 00-5 5L3 17l4 4 6-6a4 4 0 005-5l-3 3-3-1-1-3z"/>',
  livro: '<path d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4z"/><path d="M20 4h-4a3 3 0 00-2 1"/><path d="M20 4v14h-6"/>',
  pergaminho: '<path d="M7 3h11a2 2 0 012 2v2h-4"/><path d="M16 7v12a2 2 0 01-4 0v-2H4V5a2 2 0 013-2"/>',
  mais: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  caneta: '<path d="M3 21l3-1 12-12-2-2L4 18z"/><path d="M14 6l2-2 4 4-2 2"/>',
  cracha: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h4M14 14h4"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  ticket: '<path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/><path d="M9 6v12"/>',
  alerta: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h0"/>',
  contato: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c.8-2 2.2-3 4-3s3.2 1 4 3"/>',
  grupo: '<circle cx="7" cy="9" r="3"/><circle cx="17" cy="9" r="3"/><path d="M2 20c0-3 2.2-5 5-5s5 2 5 5M12 20c0-3 2.2-5 5-5s5 2 5 5"/>',
  painel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  lua: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  porta: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export type NomeIcone = keyof typeof P;

export default function Icone({ nome, tamanho = 18, className }: { nome: string; tamanho?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={"icone" + (className ? " " + className : "")}
      style={{ flex: "none" }}
      dangerouslySetInnerHTML={{ __html: P[nome] ?? P.lista }}
    />
  );
}
