import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListPlatformUsersQuery } from './list-platform-users.query';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from '../../domain/user-account.repository';
import {
  PlatformUsersListResponseDto,
  PlatformUserItemDto,
} from '../dtos/platform-users-response.dto';

@QueryHandler(ListPlatformUsersQuery)
export class ListPlatformUsersQueryHandler
  implements
    IQueryHandler<ListPlatformUsersQuery, PlatformUsersListResponseDto>
{
  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
  ) {}

  async execute(
    _query: ListPlatformUsersQuery,
  ): Promise<PlatformUsersListResponseDto> {
    const users = await this.userRepository.findAll();
    const items: PlatformUserItemDto[] = users.map((user) => {
      const p = user.toPrimitives();
      return {
        id: p.id,
        email: p.email,
        name: p.name,
        roles: p.roles,
        companyId: p.companyId,
        isActive: p.isActive,
        keycloakId: p.keycloakId ?? null,
        createdAt: p.createdAt,
        lastLoginAt: p.lastLoginAt ?? null,
      };
    });

    items.sort((a, b) =>
      (a.name || a.email).localeCompare(b.name || b.email, 'es'),
    );

    const byRole: Record<string, number> = {};
    let active = 0;
    let inactive = 0;
    for (const u of items) {
      if (u.isActive) active += 1;
      else inactive += 1;
      for (const role of u.roles) {
        byRole[role] = (byRole[role] ?? 0) + 1;
      }
    }

    return {
      users: items,
      summary: {
        total: items.length,
        active,
        inactive,
        byRole,
      },
    };
  }
}
