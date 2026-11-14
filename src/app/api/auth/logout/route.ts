import { logout } from "@/lib/mobile";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => logout(request);
