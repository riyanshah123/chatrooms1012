import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import type { ApiError } from "@chatrooms/contracts";

/**
 * Global exception filter. Every error leaves the API as the contracts
 * `ApiError` envelope; unexpected errors are logged with stack but returned
 * as an opaque 500 — internals never leak to clients.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Services throw HttpException with { code, message, details? } bodies;
      // Nest built-ins throw strings/objects — normalize both.
      const normalized: ApiError =
        typeof body === "object" && body !== null && "code" in body
          ? { error: body as ApiError["error"] }
          : {
              error: {
                code: HttpStatus[status] ?? "ERROR",
                message:
                  typeof body === "string"
                    ? body
                    : ((body as { message?: string | string[] }).message?.toString() ??
                      exception.message),
              },
            };
      res.status(status).json(normalized);
      return;
    }

    this.logger.error(
      "Unhandled exception",
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL", message: "Something went wrong." },
    } satisfies ApiError);
  }
}
