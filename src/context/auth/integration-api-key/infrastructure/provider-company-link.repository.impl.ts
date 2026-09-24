import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProviderCompanyLink,
  ProviderCompanyLinkRepository,
} from '../domain/repository/provider-company-link.repository';
import { ProviderCompanyLinkEntity } from './provider-company-link.entity';

@Injectable()
export class ProviderCompanyLinkRepositoryImpl
  implements ProviderCompanyLinkRepository
{
  constructor(
    @InjectRepository(ProviderCompanyLinkEntity)
    private readonly links: Repository<ProviderCompanyLinkEntity>,
  ) {}

  async save(providerCompanyId: string, childCompanyId: string): Promise<void> {
    await this.links.save(
      this.links.create({ providerCompanyId, childCompanyId }),
    );
  }

  async findByChild(
    childCompanyId: string,
  ): Promise<ProviderCompanyLink | null> {
    const row = await this.links.findOne({ where: { childCompanyId } });
    if (!row) return null;
    return {
      id: row.id,
      providerCompanyId: row.providerCompanyId,
      childCompanyId: row.childCompanyId,
    };
  }

  async deleteByChild(childCompanyId: string): Promise<void> {
    await this.links.delete({ childCompanyId });
  }

  async deleteByProvider(providerCompanyId: string): Promise<void> {
    await this.links.delete({ providerCompanyId });
  }
}
