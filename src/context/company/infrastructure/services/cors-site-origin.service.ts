import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { originToHost } from '../../../shared/utils/cors-origins.util';

/**
 * CORS dinámico: un Origin está permitido si su host coincide con un
 * `company_sites.domain` (alta de cliente en Admin).
 *
 * La allowlist estática (env + LeadCars) se evalúa antes, en main.ts.
 */
@Injectable()
export class CorsSiteOriginService {
  private readonly logger = new Logger(CorsSiteOriginService.name);

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  async isRegisteredSiteOrigin(origin: string): Promise<boolean> {
    const host = originToHost(origin);
    if (!host) return false;

    try {
      const result = await this.companyRepository.findByDomain(host);
      return result.isOk();
    } catch (error) {
      this.logger.warn(
        `CORS site lookup falló para ${host}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
