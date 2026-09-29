import { definirModo } from "@/app/actions";

export const ROTULO_MODO: Record<string, string> = {
  grupo: "👥 Grupo do escritório (só quando me citam)",
  auto: "🤖 Automático (trabalho + pessoal)",
  pessoal: "🏠 Pessoal (família/amigos)",
  ignorada: "🚫 Ignorar (não guarda nada)",
};

export default function ModoSelect({ id, modo }: { id: string; modo: string }) {
  return (
    <form action={definirModo} style={{ display: "flex", gap: 6 }}>
      <input type="hidden" name="id" value={id} />
      <select name="modo" defaultValue={modo} style={{ width: "auto" }}>
        {Object.entries(ROTULO_MODO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      <button>Salvar</button>
    </form>
  );
}
