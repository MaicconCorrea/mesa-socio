// Varredura: busca direto na Evolution as últimas mensagens de cada número e grava o que faltou
// (a Evolution nem sempre avisa pelo webhook — principalmente mídia mandada pelo próprio celular).
import { db, dbGlobal } from "./db";
import { comDono } from "./contexto";
import { donoDaInstancia, ultimasMensagens } from "./evolution";
import { donoDoNumero } from "./numeros";
import { gravarMensagem } from "./gravar";

export async function varrerNumero(instancia: string, qtd = 40) {
  const dono = await donoDoNumero(instancia);
  if (!dono) return { instancia, novas: 0, ignorado: "sem dono" };
  const [lista, meuNumero] = await Promise.all([ultimasMensagens(instancia, qtd), donoDaInstancia(instancia)]);
  const limite = Date.now() - 3 * 86400000; // só mensagens dos últimos 3 dias
  const recentes = lista.filter(m => {
    const t = Number(typeof m.messageTimestamp === "object" ? m.messageTimestamp?.low : m.messageTimestamp) * 1000;
    return !t || t > limite;
  });
  // só o que ainda não está na Mesa (uma consulta só, em vez de reprocessar tudo)
  const ids = recentes.map(m => m.key?.id).filter(Boolean);
  const { data: ja } = ids.length ? await dbGlobal().from("mensagens").select("msg_id").eq("dono", dono).in("msg_id", ids) : { data: [] as any[] };
  const tem = new Set((ja || []).map((x: any) => x.msg_id));
  const faltam = recentes.filter(m => m.key?.id && !tem.has(m.key.id));
  if (!faltam.length) return { instancia, lidas: recentes.length, novas: 0 };
  const novas = await comDono(dono, async () => {
    const sb = db(); let n = 0;
    for (const m of faltam.reverse()) { if (await gravarMensagem(sb, instancia, meuNumero, m)) n++; } // mais antigas primeiro
    return n;
  });
  return { instancia, lidas: recentes.length, novas };
}

export async function varrerTodos(qtd = 40) {
  const { data } = await dbGlobal().from("numeros").select("instancia").eq("ativo", true);
  const r: any[] = [];
  for (const n of data || []) { try { r.push(await varrerNumero(n.instancia, qtd)); } catch (e: any) { r.push({ instancia: n.instancia, erro: e?.message }); } }
  return r;
}
