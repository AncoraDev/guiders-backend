import { ApiProperty } from '@nestjs/swagger';

export class IdentifyVisitorResponseDto {
  @ApiProperty({
    description: 'ID único del visitante',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  visitorId: string;

  @ApiProperty({
    description: 'ID del tenant (empresa) al que pertenece el visitante',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tenantId: string;

  @ApiProperty({
    description: 'ID de la sesión activa',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  sessionId: string;

  @ApiProperty({
    description: 'Estado del ciclo de vida del visitante',
    example: 'ANON',
    enum: ['ANON', 'ENGAGED', 'LEAD', 'CONVERTED'],
  })
  lifecycle: string;

  @ApiProperty({
    description: 'Indica si es un visitante nuevo o existente',
    example: false,
  })
  isNewVisitor: boolean;

  @ApiProperty({
    description: 'Estado del consentimiento del visitante',
    example: 'granted',
    enum: ['granted', 'denied', 'pending'],
    required: false,
  })
  consentStatus?: string;

  @ApiProperty({
    description:
      'Acciones permitidas para el visitante basadas en su consentimiento',
    example: ['chat', 'forms', 'tracking'],
    type: [String],
    required: false,
  })
  allowedActions?: string[];

  @ApiProperty({
    description:
      'El visitante está bloqueado. El widget debe ocultarse sin explicar el motivo.',
    example: false,
  })
  blocked: boolean;

  constructor(props: {
    visitorId: string;
    tenantId: string;
    sessionId: string;
    lifecycle: string;
    isNewVisitor: boolean;
    consentStatus?: string;
    allowedActions?: string[];
    blocked?: boolean;
  }) {
    this.visitorId = props.visitorId;
    this.tenantId = props.tenantId;
    this.sessionId = props.sessionId;
    this.lifecycle = props.lifecycle;
    this.isNewVisitor = props.isNewVisitor;
    this.consentStatus = props.consentStatus;
    this.allowedActions = props.allowedActions;
    this.blocked = props.blocked === true;
  }
}
