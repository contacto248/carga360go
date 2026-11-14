import { health } from "@/lib/mobile";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => health(request);
