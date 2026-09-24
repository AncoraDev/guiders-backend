import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationApiKeyRepository } from '../domain/repository/integration-api-key.repository';
import { IntegrationApiKey } from '../domain/model/integration-api-key.aggregate';
import { IntegrationApiKeyId } from '../domain/model/integration-api-key-id';
import { IntegrationApiKeyCompanyId } from '../domain/model/integration-api-key-company-id';
import { IntegrationApiKeyToken } from '../domain/model/integration-api-key-token';
import { IntegrationApiKeyEntity } from './integration-api-key.entity';
import { IntegrationApiKeyMapper } from './integration-api-key.mapper';

@Injectable()
export class IntegrationApiKeyOrmAdapter
  implements IntegrationApiKeyRepository
{
  constructor(
    @InjectRepository(IntegrationApiKeyEntity)
    private readonly repo: Repository<IntegrationApiKeyEntity>,
    private readonly mapper: IntegrationApiKeyMapper,
  ) {}

  async save(key: IntegrationApiKey): Promise<void> {
    const entity = this.mapper.toEntity(key);
    await this.repo.save(entity);
  }

  async findById(id: IntegrationApiKeyId): Promise<IntegrationApiKey | null> {
    const entity = await this.repo.findOne({ where: { id: id.getValue() } });
    if (!entity) return null;
    return this.mapper.toDomain(entity);
  }

  async findByCompanyId(
    companyId: IntegrationApiKeyCompanyId,
  ): Promise<IntegrationApiKey[]> {
    const entities = await this.repo.find({
      where: { companyId: companyId.getValue() },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.mapper.toDomain(e));
  }

  async deleteByCompanyId(companyId: string): Promise<void> {
    await this.repo.delete({ companyId });
  }

  async findByTokenHash(
    tokenHash: IntegrationApiKeyToken,
  ): Promise<IntegrationApiKey | null> {
    const entity = await this.repo.findOne({
      where: { tokenHash: tokenHash.getValue() },
    });
    if (!entity) return null;
    return this.mapper.toDomain(entity);
  }
}
