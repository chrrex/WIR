import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/** Validiert Request-Bodies mit Zod; Fehlermeldungen auf Deutsch. */
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({ message: 'Eingaben unvollständig oder ungültig.', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    return r.data;
  }
}
