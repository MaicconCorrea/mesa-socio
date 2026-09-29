import { redirect } from "next/navigation";
export default function Conversa({ params }: { params: { id: string } }) { redirect(`/whatsapp?c=${params.id}`); }
