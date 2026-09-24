import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const SYNC_ROLES = ['admin', 'commercial', 'supervisor'] as const;

export class SyncCommercialFromExternalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  companyId: string;

  @ApiProperty({
    description: 'Id del comercial en LeadCars',
    example: 'lc-commercial-42',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalUserId: string;

  @ApiProperty({ example: 'ana@concesionario.es' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @ApiPropertyOptional({ example: 'García' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({
    enum: SYNC_ROLES,
    isArray: true,
    default: ['commercial'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SYNC_ROLES, { each: true })
  roles?: string[];

  @ApiPropertyOptional({
    description:
      'false da de baja al comercial en Guiders (no borra la cuenta)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SyncCommercialFromExternalResponseDto {
  @ApiProperty({
    description:
      'UUID de Guiders. Es el userId de POST /v2/integration/embed/start.',
    format: 'uuid',
  })
  userId: string;

  @ApiProperty()
  externalUserId: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty({
    description: 'true si la cuenta de Guiders se acaba de crear',
  })
  created: boolean;
}
