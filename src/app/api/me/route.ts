import { deleteMe, me } from "@/lib/mobile";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => me(request);
export const DELETE = (request: Request) => deleteMe(request);
