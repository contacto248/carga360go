import { deleteDocument, documentFile } from "@/lib/mobile";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = async (request: Request, ctx: Ctx) => documentFile(request, (await ctx.params).id);
export const DELETE = async (request: Request, ctx: Ctx) => deleteDocument(request, (await ctx.params).id);
