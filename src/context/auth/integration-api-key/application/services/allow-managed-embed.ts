import { Inject, Injectable } from '@nestjs/common';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  IWhiteLabelConfigRepository,
  WHITE_LABEL_CONFIG_REPOSITORY,
} from 'src/context/white-label/domain/white-label-config.repository';
import { WhiteLabelConfig } from 'src/context/white-label/domain/entities/white-label-config';

/** Origen de una página (esquema + host), sin ruta. */
export function pageOrigin(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * El área del proveedor abre Console de sus clientes. Activa el embed
 * de ese cliente y admite el origen de la página que lo incrusta.
 */
@Injectable()
export class AllowManagedEmbed {
  constructor(
    @Inject(WHITE_LABEL_CONFIG_REPOSITORY)
    private readonly configs: IWhiteLabelConfigRepository,
  ) {}

  async allow(companyId: string, rawOrigin: string): Promise<void> {
    const origin = pageOrigin(rawOrigin);
    const found = await this.configs.findByCompanyId(companyId);
    const current = found.isOk()
      ? found.unwrap()
      : WhiteLabelConfig.createDefault(Uuid.random().value, companyId, '');
    const origins = new Set(current.embedAllowedOrigins);
    if (origin) origins.add(origin);
    const saved = await this.configs.save(
      current.update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: [...origins],
        },
      }),
    );
    if (saved.isErr()) {
      throw saved.error;
    }
  }
}
