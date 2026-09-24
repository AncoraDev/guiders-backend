import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProviderRecord,
  ProviderRepository,
  ProviderSaveInput,
} from '../../../domain/provider.repository';
import { ProviderEntity } from '../entity/provider.entity';

function toRecord(row: ProviderEntity): ProviderRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    createdAt: row.createdAt,
    accessToken: row.accessToken ?? '',
    demoAdminEmail: row.demoAdminEmail ?? '',
    demoAdminPassword: row.demoAdminPassword ?? '',
  };
}

@Injectable()
export class ProviderRepositoryImpl implements ProviderRepository {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
  ) {}

  async save(input: ProviderSaveInput): Promise<ProviderRecord> {
    const saved = await this.providers.save(this.providers.create(input));
    return toRecord(saved);
  }

  async findById(id: string): Promise<ProviderRecord | null> {
    const row = await this.providers.findOne({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async findByCompanyId(companyId: string): Promise<ProviderRecord | null> {
    const row = await this.providers.findOne({ where: { companyId } });
    return row ? toRecord(row) : null;
  }

  async findByDemoAdminEmail(email: string): Promise<ProviderRecord | null> {
    const row = await this.providers
      .createQueryBuilder('provider')
      .where('lower(provider.demo_admin_email) = :email', {
        email: email.trim().toLowerCase(),
      })
      .getOne();
    return row ? toRecord(row) : null;
  }

  async findAll(): Promise<ProviderRecord[]> {
    const rows = await this.providers.find({ order: { createdAt: 'DESC' } });
    return rows.map(toRecord);
  }

  async companyIds(): Promise<string[]> {
    const rows = await this.providers.find({ select: { companyId: true } });
    return rows.map((row) => row.companyId);
  }

  async updateAccess(
    id: string,
    input: {
      accessToken?: string;
      demoAdminEmail?: string;
      demoAdminPassword?: string;
    },
  ): Promise<void> {
    await this.providers.update({ id }, input);
  }

  async delete(id: string): Promise<void> {
    await this.providers.delete({ id });
  }
}
