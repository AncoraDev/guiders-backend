import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO de respuesta para GET /v2/integration/embed/audit-log (Story 2.2, Task 7.2).
 *
 * NOTA: la `ipAddress` NUNCA se incluye en la response (es PII).
 * Solo exponemos `ipAddressHash` para correlación.
 */

export class EmbedTokenAuditLogEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ format: 'uuid', required: false })
  userId?: string;

  @ApiProperty({ example: 'https://app.integrator.com' })
  origin!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: Date;

  @ApiProperty({
    description: 'SHA-256 prefix 16 chars de la IP (GDPR compliant)',
    example: 'a1b2c3d4e5f6a7b8',
  })
  ipAddressHash!: string;

  @ApiProperty({ example: 'Mozilla/5.0 ...' })
  userAgent!: string;

  @ApiProperty({ example: '/embed/authenticate-session' })
  endpoint!: string;

  @ApiProperty({ enum: ['success', 'failure'] })
  result!: 'success' | 'failure';

  @ApiProperty({ required: false, example: 'EMBED_TOKEN_EXPIRED' })
  failureReason?: string;

  @ApiProperty({ required: false })
  failureDetail?: string;
}

export class EmbedTokenAuditLogListResponseDto {
  @ApiProperty({ type: [EmbedTokenAuditLogEntryDto] })
  events!: EmbedTokenAuditLogEntryDto[];

  @ApiProperty({
    description: 'Total de eventos que matchean (sin paginación)',
  })
  total!: number;
}
