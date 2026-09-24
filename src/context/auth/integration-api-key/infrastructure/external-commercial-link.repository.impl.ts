import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExternalCommercialLink,
  ExternalCommercialLinkRepository,
  LEADCARS_PROVIDER,
} from '../domain/repository/external-commercial-link.repository';
import { ExternalCommercialLinkEntity } from './external-commercial-link.entity';

@Injectable()
export class ExternalCommercialLinkRepositoryImpl
  implements ExternalCommercialLinkRepository
{
  constructor(
    @InjectRepository(ExternalCommercialLinkEntity)
    private readonly links: Repository<ExternalCommercialLinkEntity>,
  ) {}

  async findByExternalUserId(
    companyId: string,
    externalUserId: string,
    provider: string = LEADCARS_PROVIDER,
  ): Promise<ExternalCommercialLink | null> {
    const row = await this.links.findOne({
      where: { companyId, externalUserId, provider },
    });
    if (!row) return null;
    return {
      id: row.id,
      companyId: row.companyId,
      externalUserId: row.externalUserId,
      userAccountId: row.userAccountId,
      provider: row.provider,
    };
  }

  async deleteByExternalUserId(
    companyId: string,
    externalUserId: string,
    provider: string = LEADCARS_PROVIDER,
  ): Promise<void> {
    await this.links.delete({ companyId, externalUserId, provider });
  }

  async deleteByCompanyId(companyId: string): Promise<void> {
    await this.links.delete({ companyId });
  }

  async save(link: ExternalCommercialLink): Promise<void> {
    await this.links.save({
      id: link.id,
      companyId: link.companyId,
      externalUserId: link.externalUserId,
      userAccountId: link.userAccountId,
      provider: link.provider,
    });
  }
}
