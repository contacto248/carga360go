"use client";

/**
 * Chat web legacy (Asistente / FAB WhatsApp).
 * T-064: los FAB flotantes se retiraron. El único botón flotante es Carga360
 * (`VoiceAgentLauncher`). Este módulo queda sin UI flotante para que no
 * reaparezcan botones que se tapaban entre sí.
 */
export function HelpLauncher(_props: { chatEnabled?: boolean; waHref?: string } = {}) {
  void _props;
  return null;
}
