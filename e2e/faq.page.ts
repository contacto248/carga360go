import type { Locator, Page } from "@playwright/test";
import { keepRawAndClean, type MemoryRecord } from "../src/lib/web-automation/extract";

/** Página pública estable ya existente: `/faq`. Locators por rol, sin login. */
export class FaqPage {
  constructor(private readonly page: Page) {}

  private main(): Locator {
    return this.page.getByRole("main");
  }

  async open(): Promise<void> {
    await this.page.goto("/faq");
  }

  heading(): Locator {
    return this.main().getByRole("heading", { level: 1, name: "Preguntas frecuentes" });
  }

  question(name: string | RegExp): Locator {
    return this.main().getByRole("button", { name });
  }

  guidesLink(): Locator {
    return this.main().getByRole("link", { name: "Guías", exact: true });
  }

  /**
   * Fallback de UI. raw y clean quedan en memoria.
   * La rutina de resumen no usa este método: parte de datos ya obtenidos.
   */
  async extractQuestions(): Promise<MemoryRecord[]> {
    const names = await this.question(/^¿/).allInnerTexts();
    return names.map((title) =>
      keepRawAndClean({
        title: title.replace(/\s+/g, " ").trim(),
        amountText: null,
        dateText: null,
        href: "/faq",
      }),
    );
  }
}
