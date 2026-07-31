import { Injectable, Logger } from '@nestjs/common';
import { UserAccountRepository } from '../../domain/user-account.repository';
import { UserAccount } from '../../domain/user-account.aggregate';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { UserAccountEntity } from '../user-account.entity';
import { UserAccountMapper } from '../user-account-mapper';
import { UserAccountCompanyId } from '../../domain/value-objects/user-account-company-id';
import { UserAccountKeycloakId } from '../../domain/value-objects/user-account-keycloak-id';

@Injectable()
export class UserAccountService implements UserAccountRepository {
  private readonly logger = new Logger(UserAccountService.name);
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly userAccountMapper: UserAccountMapper,
  ) {}
  async findById(id: string): Promise<UserAccount | null> {
    if (!id) {
      this.logger.error('ID is required');
      return null;
    }
    const user = await this.entityManager.findOne(UserAccountEntity, {
      where: { id },
    });
    return this.userAccountMapper.fromEntity(user);
  }
  async findByEmail(email: string): Promise<UserAccount | null> {
    if (!email) {
      this.logger.error('Email is required');
      return null;
    }
    const user = await this.entityManager.findOne(UserAccountEntity, {
      where: { email },
    });
    return this.userAccountMapper.fromEntity(user);
  }

  async findByKeycloakId(
    keycloakId: UserAccountKeycloakId,
  ): Promise<UserAccount | null> {
    if (!keycloakId) {
      this.logger.error('Keycloak ID is required');
      return null;
    }
    const user = await this.entityManager.findOne(UserAccountEntity, {
      where: { keycloakId: keycloakId.value },
    });
    return this.userAccountMapper.fromEntity(user);
  }
  async findByCompanyId(
    companyId: UserAccountCompanyId,
  ): Promise<UserAccount[]> {
    if (!companyId) {
      this.logger.error('companyId is required');
      return [];
    }
    const userEntities = await this.entityManager.find(UserAccountEntity, {
      where: { companyId: companyId.getValue() },
    });
    return userEntities
      .map((user) => this.userAccountMapper.fromEntity(user))
      .filter(Boolean) as UserAccount[];
  }
  async save(userAccount: UserAccount): Promise<void> {
    const userAccountEntity = this.userAccountMapper.toEntity(userAccount);
    try {
      await this.entityManager.save(UserAccountEntity, userAccountEntity);
    } catch (error) {
      this.logger.error('Error saving user account', error);
      throw error;
    }
    return;
  }

  async delete(id: string): Promise<void> {
    if (!id) {
      this.logger.error('ID is required for delete');
      return;
    }
    try {
      await this.entityManager.delete(UserAccountEntity, { id });
    } catch (error) {
      this.logger.error('Error deleting user account', error);
      throw error;
    }
  }
}
