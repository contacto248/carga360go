/** Sello público «Verificado»: solo si la cuenta está verificada y los documentos están al día. */
export function publicVerifiedSeal(status: string, docsOk?: boolean): boolean {
  return status === "verificado" && docsOk === true;
}
