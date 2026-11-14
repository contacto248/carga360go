import { guard, requireUser } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { registrationPdfEnabled, registrationPdfFor } from "@/lib/registration-pdf";

/** Descarga la copia en PDF de la inscripción de la cuenta con sesión (detrás de REGISTRATION_PDF_ENABLED). */
export const GET = guard(async () => {
  if (!registrationPdfEnabled()) throw new AppError("No encontrado.", 404);
  const user = await requireUser();
  const file = registrationPdfFor(user.id);
  return new Response(new Uint8Array(file.content), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "private, no-store",
    },
  });
});
