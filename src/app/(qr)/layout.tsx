import type { ReactNode } from "react";
import type { Viewport } from "next";

export const viewport: Viewport = { themeColor: "#0D1014" };

export default function QrLayout({ children }: { children: ReactNode }) {
  return children;
}
