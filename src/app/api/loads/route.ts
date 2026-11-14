import { createLoadMobile, loads } from "@/lib/mobile";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => loads(request);
export const POST = (request: Request) => createLoadMobile(request);
