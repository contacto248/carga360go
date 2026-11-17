import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { publicFreightParams, readFreightConfig } from "@/lib/freight-cost";

/** Parámetros vigentes del cálculo (base o respaldo). No incluye auditoría. */
export const GET = guard(async () => {
  return NextResponse.json(publicFreightParams(readFreightConfig()));
});
