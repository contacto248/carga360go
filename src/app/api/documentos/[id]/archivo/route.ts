import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { guard, requireUser } from "@/lib/api";
import { readDocumentFile } from "@/lib/documents";

export const GET = guard(async (_request, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const file = readDocumentFile(user, id);
  const bytes = new Uint8Array(await readFile(file.filePath));
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
