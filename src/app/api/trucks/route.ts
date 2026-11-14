import { createTruckMobile, trucks } from "@/lib/mobile";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => trucks(request);
export const POST = (request: Request) => createTruckMobile(request);
