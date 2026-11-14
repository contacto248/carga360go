import { NextResponse } from "next/server";
import { payRoute } from "@/lib/pagos/http";
import { accountView, disconnectAccount } from "@/lib/pagos/service";

export const POST = payRoute(["transportista"], async (_request, user) => {
  disconnectAccount(user);
  return NextResponse.json({ cuenta: accountView(user.id) });
});
