import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_LEAD_CAPTURE_STEPS } from '../../domain/entities/lead-capture-flow';
import {
  LeadCaptureSessionPhase,
  LeadCaptureSessionPrimitives,
  LeadCaptureSessionStatus,
} from '../../domain/entities/lead-capture-session';

export class LeadCaptureAnswerDto {
  @ApiProperty({ description: 'Paso del guion que se respondió' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  stepId: string;

  @ApiProperty({ description: 'Pregunta tal como la vio el visitante' })
  @IsString()
  @MaxLength(500)
  prompt: string;

  @ApiProperty({ description: 'Respuesta del visitante' })
  @IsString()
  @MaxLength(500)
  answer: string;

  @ApiPropertyOptional({ description: 'Campo del lead al que apunta el paso' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  field?: string;
}

export class SaveLeadCaptureSessionDto {
  @ApiPropertyOptional({
    description: 'Chat donde se está recorriendo el guion',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  chatId?: string | null;

  @ApiPropertyOptional({ description: 'Guion que se está recorriendo' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  flowId?: string;

  @ApiProperty({
    description: 'Punto del asistente donde se quedó el visitante',
    enum: ['intro', 'steps', 'final', 'done'],
  })
  @IsIn(['intro', 'steps', 'final', 'done'])
  phase: LeadCaptureSessionPhase;

  @ApiPropertyOptional({ description: 'Paso actual', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stepId?: string | null;

  @ApiProperty({ type: [LeadCaptureAnswerDto] })
  @IsArray()
  @ArrayMaxSize(MAX_LEAD_CAPTURE_STEPS)
  @ValidateNested({ each: true })
  @Type(() => LeadCaptureAnswerDto)
  answers: LeadCaptureAnswerDto[];

  @ApiProperty({
    description: 'Pasos ya recorridos, en orden',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(MAX_LEAD_CAPTURE_STEPS)
  @IsString({ each: true })
  trail: string[];
}

export class LeadCaptureSessionResponseDto {
  @ApiProperty({ enum: ['in_progress', 'completed'] })
  status: LeadCaptureSessionStatus;

  @ApiProperty({ enum: ['intro', 'steps', 'final', 'done'] })
  phase: LeadCaptureSessionPhase;

  @ApiPropertyOptional({ nullable: true })
  stepId: string | null;

  @ApiPropertyOptional({ nullable: true })
  chatId: string | null;

  @ApiPropertyOptional()
  flowId?: string;

  @ApiProperty({ type: [LeadCaptureAnswerDto] })
  answers: LeadCaptureAnswerDto[];

  @ApiProperty({ type: [String] })
  trail: string[];

  @ApiProperty()
  updatedAt: string;

  static fromPrimitives(
    session: LeadCaptureSessionPrimitives,
  ): LeadCaptureSessionResponseDto {
    return {
      status: session.status,
      phase: session.phase,
      stepId: session.stepId,
      chatId: session.chatId,
      flowId: session.flowId,
      answers: session.answers as LeadCaptureAnswerDto[],
      trail: session.trail,
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}

export class LeadCaptureSessionEnvelopeDto {
  @ApiPropertyOptional({
    type: LeadCaptureSessionResponseDto,
    nullable: true,
    description: 'null cuando el visitante nunca entró en el guion',
  })
  session: LeadCaptureSessionResponseDto | null;
}
