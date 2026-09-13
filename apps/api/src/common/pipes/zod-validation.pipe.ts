import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodSchema } from "zod";

/**
 * Validates + strips request bodies/queries against a zod schema.
 * Usage: `@Body(new ZodValidationPipe(createPromptSchema)) dto: CreatePromptDto`
 * Unknown keys are dropped (zod default), types are coerced by the schema —
 * this is the single input-validation layer (SQLi is impossible past Prisma's
 * parameterized queries; XSS is handled by sanitizing content fields).
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Request validation failed.",
        details: Object.fromEntries(
          result.error.issues.map((i) => [i.path.join(".") || "_", i.message]),
        ),
      });
    }
    return result.data;
  }
}
