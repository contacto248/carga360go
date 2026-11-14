import { notSupported } from "@/lib/mobile";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => notSupported(request);
