import { documents, uploadDocument } from "@/lib/mobile";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => documents(request);
export const POST = (request: Request) => uploadDocument(request);
