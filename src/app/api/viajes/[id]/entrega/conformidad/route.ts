import { guard } from "@/lib/api";
import { entregaConformidad } from "@/lib/qr/handoff";

export const POST = guard(async () => entregaConformidad());
