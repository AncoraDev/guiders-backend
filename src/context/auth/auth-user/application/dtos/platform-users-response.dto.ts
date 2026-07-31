import { ApiProperty } from '@nestjs/swagger';

export class PlatformUserItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty()
  companyId!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ nullable: true })
  keycloakId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  lastLoginAt!: Date | null;
}

export class PlatformUsersSummaryDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  inactive!: number;

  @ApiProperty({
    description: 'Conteo por rol (un usuario con varios roles suma en cada uno)',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  byRole!: Record<string, number>;
}

export class PlatformUsersListResponseDto {
  @ApiProperty({ type: [PlatformUserItemDto] })
  users!: PlatformUserItemDto[];

  @ApiProperty({ type: PlatformUsersSummaryDto })
  summary!: PlatformUsersSummaryDto;
}
