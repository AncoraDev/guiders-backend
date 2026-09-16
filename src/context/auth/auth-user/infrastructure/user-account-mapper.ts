import { Injectable } from '@nestjs/common';
import { UserAccount } from '../domain/user-account.aggregate';
import { UserAccountEntity } from './user-account.entity';

@Injectable()
export class UserAccountMapper {
  fromEntity(userAccountEntity: UserAccountEntity | null): UserAccount | null {
    if (!userAccountEntity) {
      return null;
    }
    return UserAccount.fromPrimitives({
      id: userAccountEntity.id,
      email: userAccountEntity.email,
      name: userAccountEntity.name,
      password: userAccountEntity.password,
      createdAt: userAccountEntity.createdAt,
      updatedAt: userAccountEntity.updatedAt,
      lastLoginAt: userAccountEntity.lastLoginAt,
      roles: userAccountEntity.roles ?? [],
      companyId: userAccountEntity.companyId,
      isActive: userAccountEntity.isActive ?? true,
      keycloakId: userAccountEntity.keycloakId,
      avatarUrl: userAccountEntity.avatarUrl,
      greetingMessage: userAccountEntity.greetingMessage ?? null,
    });
  }

  toEntity(userAccount: UserAccount): UserAccountEntity {
    const userAccountEntity = new UserAccountEntity();
    userAccountEntity.id = userAccount.id.getValue();
    userAccountEntity.email = userAccount.email.getValue();
    userAccountEntity.name = userAccount.name.getValue();
    userAccountEntity.password = userAccount.password.getOrNull();
    userAccountEntity.createdAt = userAccount.createdAt.getValue();
    userAccountEntity.updatedAt = userAccount.updatedAt.getValue();
    userAccountEntity.lastLoginAt = userAccount.lastLoginAt.getOrNull();
    userAccountEntity.roles = userAccount.roles.toPrimitives();
    userAccountEntity.companyId = userAccount.companyId.getValue();
    userAccountEntity.isActive = userAccount.isActive;
    userAccountEntity.keycloakId =
      userAccount.keycloakId.getOrNull()?.value ?? null;
    userAccountEntity.avatarUrl = userAccount.avatarUrl.getOrNull();
    userAccountEntity.greetingMessage = userAccount.greetingMessage;
    return userAccountEntity;
  }
}
