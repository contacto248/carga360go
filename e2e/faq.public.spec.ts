import { expect, test } from "@playwright/test";
import { FaqPage } from "./faq.page";

/**
 * No corre en CI: hace falta browser y un servidor en PLAYWRIGHT_BASE_URL.
 * Local: `npm run dev` y después `npm run test:e2e`.
 * El default de baseURL es http://127.0.0.1:4317. No apunta a producción.
 */
test.describe("FAQ pública", () => {
  test("muestra el título y una pregunta estable", async ({ page }) => {
    const faq = new FaqPage(page);
    await faq.open();
    await expect(faq.heading()).toBeVisible();
    await expect(faq.question("¿Cómo se calcula el costo del flete?")).toBeVisible();
    await expect(faq.guidesLink()).toBeVisible();
    const records = await faq.extractQuestions();
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]?.clean.href).toBe("/faq");
    expect(records[0]?.raw.title.length).toBeGreaterThan(0);
  });
});
