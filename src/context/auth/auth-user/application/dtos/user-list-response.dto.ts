// DTO para la respuesta de listado de usuarios por compañía
// Ubicación: src/context/auth/auth-user/application/dtos/user-list-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class UserListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  roles: string[];

  @ApiProperty()
  companyId: string;

  @ApiProperty({ default: true })
  isActive: boolean;

  @ApiProperty({ required: false, nullable: true })
  keycloakId: string | null;

  @ApiProperty({ required: false, nullable: true })
  avatarUrl?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ required: false, nullable: true })
  lastLoginAt: Date | null;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserListItemDto] })
  users: UserListItemDto[];
}

// DTO para respuesta de usuario individual
export type UserResponseDto = UserListItemDto;
