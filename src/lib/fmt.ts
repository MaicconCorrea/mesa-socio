const TZ = "America/Sao_Paulo";

export function dataHora(ts?: string | null) {
  if (!ts) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(ts));
}

export function hojeISO() {
  // AAAA-MM-DD no fuso de São Paulo
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function fimDoDia() {
  return new Date(`${hojeISO()}T23:59:59-03:00`);
}

export function agoraTexto() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}

export function haQuanto(ts?: string | null) {
  if (!ts) return "";
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export function numeroDoJid(jid: string) {
  const n = (jid || "").split("@")[0].split(":")[0];
  if (/^55\d{10,11}$/.test(n)) {
    const ddd = n.slice(2, 4), resto = n.slice(4);
    return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
  }
  return n;
}

export const ROTULO_TIPO: Record<string, string> = {
  pedido: "Pedido",
  promessa: "Prometi",
  reuniao: "Reunião",
  outro: "Anotação",
};
