export class AppError extends Error {
  status: number;
  code?: string;
  reglaPolicy?: string;

  constructor(message: string, status = 400, code?: string, reglaPolicy?: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.reglaPolicy = reglaPolicy;
  }
}
