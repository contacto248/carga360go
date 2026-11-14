import { deleteTruckMobile, truck } from "@/lib/mobile";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = async (request: Request, ctx: Ctx) => truck(request, (await ctx.params).id);
export const DELETE = async (request: Request, ctx: Ctx) => deleteTruckMobile(request, (await ctx.params).id);
