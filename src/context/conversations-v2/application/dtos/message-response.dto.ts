import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para respuesta de un mensaje individual
 */
export class MessageResponseDto {
  @ApiProperty({
    description: 'ID único del mensaje',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'ID del chat al que pertenece el mensaje',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  chatId: string;

  @ApiProperty({
    description: 'ID del remitente del mensaje',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  senderId: string;

  @ApiProperty({
    description: 'Contenido del mensaje',
    example: 'Hola, ¿en qué puedo ayudarte?',
  })
  content: string;

  @ApiProperty({
    description: 'Tipo de mensaje',
    enum: ['text', 'image', 'file', 'system', 'ai', 'interactive'],
    example: 'text',
  })
  type: string;

  @ApiProperty({
    description: 'Datos del sistema (para mensajes de tipo system)',
    required: false,
    example: {
      action: 'assigned',
      fromUserId: 'user-123',
      toUserId: 'user-456',
      reason: 'Transferencia por especialización',
    },
  })
  systemData?: {
    action?: string;
    fromUserId?: string;
    toUserId?: string;
    reason?: string;
    requestId?: string;
    status?: 'pending' | 'submitted' | 'confirmed' | 'cancelled';
    preface?: string;
    legal?: {
      privacyPolicyUrl: string;
      privacyCheckboxLabel: string;
      marketingCheckboxLabel: string;
    };
    acceptedPrivacyPolicy?: boolean;
    acceptedMarketing?: boolean;
    data?: {
      nombre?: string;
      apellidos?: string;
      email?: string;
      telefono?: string;
      poblacion?: string;
    };
    // Captación sin agentes: guion recorrido y respuestas del visitante
    flowId?: string;
    answers?: {
      stepId: string;
      prompt: string;
      answer: string;
      field?: string;
    }[];
    capturedWithoutAgent?: boolean;
  };

  @ApiProperty({
    description: 'Datos del archivo adjunto',
    required: false,
    example: {
      url: 'https://example.com/file.pdf',
      fileName: 'documento.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
    },
  })
  attachment?: {
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  };

  @ApiProperty({
    description:
      'Indica si es un mensaje interno (solo visible para comerciales)',
    example: false,
  })
  isInternal: boolean;

  @ApiProperty({
    description: 'Indica si es la primera respuesta del comercial',
    example: false,
  })
  isFirstResponse: boolean;

  @ApiProperty({
    description: 'Fecha y hora de creación del mensaje',
    example: '2025-07-28T10:30:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Fecha y hora de última actualización',
    example: '2025-07-28T10:30:00.000Z',
  })
  updatedAt: string;

  @ApiProperty({
    description: 'Indica si el mensaje ha sido leído',
    example: false,
  })
  isRead: boolean;

  @ApiProperty({
    description: 'Fecha y hora en que el mensaje fue leído',
    example: '2025-07-28T10:35:00.000Z',
    required: false,
  })
  readAt?: string;

  @ApiProperty({
    description: 'ID del usuario que leyó el mensaje',
    example: '550e8400-e29b-41d4-a716-446655440003',
    required: false,
  })
  readBy?: string;

  @ApiProperty({
    description: 'Indica si el mensaje fue generado por IA',
    example: false,
  })
  isAI: boolean;

  @ApiProperty({
    description: 'Metadatos de IA (para mensajes generados por IA)',
    required: false,
    example: {
      model: 'gpt-4',
      confidence: 0.95,
      suggestedActions: ['Ver más opciones', 'Contactar soporte'],
      processingTimeMs: 250,
    },
  })
  aiMetadata?: {
    model?: string;
    confidence?: number;
    suggestedActions?: string[];
    processingTimeMs?: number;
    context?: Record<string, unknown>;
  };
}

/**
 * DTO para respuesta de lista de mensajes paginada
 */
export class MessageListResponseDto {
  @ApiProperty({
    description: 'Lista de mensajes',
    type: [MessageResponseDto],
  })
  messages: MessageResponseDto[];

  @ApiProperty({
    description: 'Número total de mensajes que cumplen los filtros',
    example: 150,
  })
  total: number;

  @ApiProperty({
    description: 'Indica si hay más mensajes disponibles',
    example: true,
  })
  hasMore: boolean;

  @ApiProperty({
    description:
      'Cursor para la siguiente página (paginación basada en cursor)',
    example:
      'eyJzZW50QXQiOiIyMDI1LTA3LTI4VDEwOjMwOjAwLjAwMFoiLCJpZCI6Im1zZy0xMjMifQ==',
    required: false,
  })
  nextCursor?: string;
}

/**
 * DTO para estadísticas de conversación
 */
export class ConversationStatsResponseDto {
  @ApiProperty({
    description: 'Número total de mensajes en la conversación',
    example: 45,
  })
  totalMessages: number;

  @ApiProperty({
    description: 'Número de mensajes por tipo',
    example: {
      text: 40,
      image: 3,
      file: 1,
      system: 1,
    },
  })
  messagesByType: Record<string, number>;

  @ApiProperty({
    description: 'Tiempo promedio de respuesta en minutos',
    example: 15.5,
  })
  averageResponseTime: number;

  @ApiProperty({
    description: 'Número de mensajes no leídos',
    example: 3,
  })
  unreadCount: number;

  @ApiProperty({
    description: 'Fecha y hora de la última actividad',
    example: '2025-07-28T11:15:00.000Z',
  })
  lastActivity: string;

  @ApiProperty({
    description: 'Número de participantes en la conversación',
    example: 2,
  })
  participantCount: number;
}

/**
 * DTO para métricas de mensajería por período
 */
export class MessageMetricsResponseDto {
  @ApiProperty({
    description: 'Período de tiempo',
    example: '2025-07-28',
  })
  period: string;

  @ApiProperty({
    description: 'Número total de mensajes en el período',
    example: 120,
  })
  totalMessages: number;

  @ApiProperty({
    description: 'Número de mensajes por tipo en el período',
    example: {
      text: 100,
      image: 15,
      file: 5,
    },
  })
  messagesByType: Record<string, number>;

  @ApiProperty({
    description: 'Longitud promedio de los mensajes',
    example: 85.3,
  })
  averageLength: number;

  @ApiProperty({
    description: 'Tiempo promedio de respuesta en minutos',
    example: 12.7,
  })
  responseTimeMinutes: number;
}
