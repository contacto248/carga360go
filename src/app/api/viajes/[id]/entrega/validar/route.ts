import { guard } from "@/lib/api";
import { entregaValidar } from "@/lib/qr/handoff";

export const POST = guard(async () => entregaValidar());
