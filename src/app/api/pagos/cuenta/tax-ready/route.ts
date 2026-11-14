import { NextResponse } from "next/server";
import { payRoute, readJson } from "@/lib/pagos/http";
import { accountView, setTaxReady } from "@/lib/pagos/service";

/** Declaración informada de que el transportista puede emitir factura o boleta del flete. */
export const POST = payRoute(["transportista"], async (request, user) => {
  const body = await readJson(request);
  setTaxReady(user, body.value === true);
  return NextResponse.json({ cuenta: accountView(user.id) });
});
