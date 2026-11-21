"use client";

type Props = {
  className?: string;
  label?: string;
};

/**
 * Abre el único FAB «Asistente ÓRBITA» del pie. No crea un segundo FAB.
 */
export function OpenAgentCta({
  className = "btn home-video-agent-btn",
  label = "Hablar con Asistente ÓRBITA",
}: Props) {
  return (
    <button
      type="button"
      className={className}
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
      {label}
    </button>
  );
}
