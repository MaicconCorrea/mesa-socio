"use client";
import { useRef, useState } from "react";

// Corpo do e-mail (HTML isolado num iframe)
export default function CorpoEmail({ m }: { m: { html: string | null; texto: string | null } }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [altura, setAltura] = useState(120);
  if (!m.html) return <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{m.texto || "(sem conteúdo)"}</div>;
  const doc = `<!doctype html><html><head><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:13.5px;color:#222;margin:0;word-wrap:break-word}img{max-width:100%;height:auto}blockquote{border-left:3px solid #ddd;margin:6px 0;padding-left:8px;color:#666}</style></head><body>${m.html}</body></html>`;
  return <iframe ref={ref} sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" srcDoc={doc} style={{ width: "100%", border: 0, height: altura }}
    onLoad={() => { try { const h = ref.current?.contentDocument?.body?.scrollHeight; if (h) setAltura(Math.min(h + 20, 4000)); } catch {} }} />;
}

