"use client";

/**
 * CTA de la sección de video: abre el FAB único Carga360 (pie)
 * sin autoplay de video ni sonido.
 */
export function OpenAgentCta() {
  return (
    <button
      type="button"
      className="btn home-video-agent-btn"
      onClick={() => {
        const fab = document.querySelector<HTMLButtonElement>("button.agent-fab");
        if (fab) {
          fab.click();
          fab.focus();
          return;
        }
        document.getElementById("c360-agent-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }}
    >
      Hablar con Carga360go
    </button>
  );
}
