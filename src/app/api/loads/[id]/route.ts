import { deleteLoadMobile, load } from "@/lib/mobile";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = async (request: Request, ctx: Ctx) => load(request, (await ctx.params).id);
export const DELETE = async (request: Request, ctx: Ctx) => deleteLoadMobile(request, (await ctx.params).id);
