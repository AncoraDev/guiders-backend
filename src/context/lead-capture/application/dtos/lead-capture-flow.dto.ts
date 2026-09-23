import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  LeadCaptureFlowPrimitives,
  LeadCaptureStepType,
  LeadCaptureValidation,
  MAX_LEAD_CAPTURE_OPTIONS,
  MAX_LEAD_CAPTURE_STEPS,
} from '../../domain/entities/lead-capture-flow';
import { ContactFormLegalPrimitives } from 'src/context/company/domain/value-objects/company-contact-form-legal';

export class LeadCaptureOptionDto {
  @ApiProperty({ description: 'Identificador de la opción' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  id: string;

  @ApiProperty({ description: 'Texto del botón que ve el visitante' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiPropertyOptional({
    description:
      'Paso siguiente. null pide datos de contacto; __end__ cierra sin formulario',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  next?: string | null;
}

export class LeadCaptureStepDto {
  @ApiProperty({ description: 'Identificador del paso' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  id: string;

  @ApiProperty({
    description: 'Tipo de paso',
    enum: ['message', 'choice', 'text'],
  })
  @IsIn(['message', 'choice', 'text'])
  type: LeadCaptureStepType;

  @ApiProperty({ description: 'Texto que se muestra al visitante' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt: string;

  @ApiPropertyOptional({ type: [LeadCaptureOptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LEAD_CAPTURE_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => LeadCaptureOptionDto)
  options?: LeadCaptureOptionDto[];

  @ApiPropertyOptional({
    description:
      'Campo del lead donde acaba la respuesta; si no es un campo conocido se guarda en additionalData',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  field?: string;

  @ApiPropertyOptional({ enum: ['email', 'phone', 'none'] })
  @IsOptional()
  @IsIn(['email', 'phone', 'none'])
  validation?: LeadCaptureValidation;

  @ApiPropertyOptional({ description: 'La respuesta es obligatoria' })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description:
      'Paso siguiente. null pide datos de contacto; __end__ cierra sin formulario',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  next?: string | null;
}

export class LeadCaptureIntroDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body: string;

  @ApiProperty({ description: 'Texto del botón que inicia el guion' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  ctaLabel: string;
}

export class SaveLeadCaptureFlowDto {
  @ApiProperty({ description: 'Nombre interno del guion' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'El guion se muestra a los visitantes' })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ type: LeadCaptureIntroDto })
  @ValidateNested()
  @Type(() => LeadCaptureIntroDto)
  intro: LeadCaptureIntroDto;

  @ApiProperty({ description: 'Paso por el que empieza el guion' })
  @IsString()
  @IsNotEmpty()
  startStepId: string;

  @ApiProperty({ type: [LeadCaptureStepDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LEAD_CAPTURE_STEPS)
  @ValidateNested({ each: true })
  @Type(() => LeadCaptureStepDto)
  steps: LeadCaptureStepDto[];
}

export class ResolveLeadCaptureFlowDto {
  @ApiProperty({ description: 'Dominio del sitio donde corre el SDK' })
  @IsString()
  @IsNotEmpty()
  domain: string;

  @ApiProperty({ description: 'API Key pública del sitio' })
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}

export class LeadCaptureFlowResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: LeadCaptureIntroDto })
  intro: LeadCaptureIntroDto;

  @ApiProperty()
  startStepId: string;

  @ApiProperty({ type: [LeadCaptureStepDto] })
  steps: LeadCaptureStepDto[];

  @ApiProperty()
  updatedAt: string;

  @ApiProperty()
  updatedBy: string;

  static fromPrimitives(
    flow: LeadCaptureFlowPrimitives,
  ): LeadCaptureFlowResponseDto {
    return {
      id: flow.id,
      name: flow.name,
      enabled: flow.enabled,
      intro: flow.intro,
      startStepId: flow.startStepId,
      steps: flow.steps as LeadCaptureStepDto[],
      updatedAt: flow.updatedAt.toISOString(),
      updatedBy: flow.updatedBy,
    };
  }
}

export class LeadCaptureFlowEnvelopeDto {
  @ApiPropertyOptional({
    type: LeadCaptureFlowResponseDto,
    nullable: true,
    description: 'null cuando la empresa no ha configurado ningún guion',
  })
  flow: LeadCaptureFlowResponseDto | null;
}

export class ResolvedLeadCaptureFlowDto extends LeadCaptureFlowEnvelopeDto {
  @ApiProperty({
    description:
      'Textos legales de la empresa para el paso final de datos de contacto',
  })
  legal: ContactFormLegalPrimitives;
}
