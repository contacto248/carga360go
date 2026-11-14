import { login } from "@/lib/mobile";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => login(request);
