"use client";

type Props = {
  className?: string;
  label?: string;
};

/**
 * Abre el FAB único «Carga360» del pie (T-064). No crea un segundo FAB.
 */
export function OpenAgentCta({
  className = "btn home-video-agent-btn",
  label = "Hablar con Carga360go",
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
