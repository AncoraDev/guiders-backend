import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class LeadCaptureAnswerDto {
  @ApiProperty({ description: 'Paso del guion' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  stepId: string;

  @ApiProperty({ description: 'Pregunta que se mostró al visitante' })
  @IsString()
  @MaxLength(500)
  prompt: string;

  @ApiProperty({ description: 'Respuesta del visitante' })
  @IsString()
  @MaxLength(500)
  answer: string;

  @ApiPropertyOptional({
    description: 'Campo del lead al que apuntaba el paso',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  field?: string;
}

export class SubmitLeadCaptureDto {
  @ApiPropertyOptional({ description: 'Guion recorrido' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  flowId?: string;

  @ApiProperty({ description: 'Nombre del visitante' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @ApiPropertyOptional({ description: 'Apellidos del visitante' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellidos?: string;

  @ApiPropertyOptional({ description: 'Email del visitante' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Teléfono del visitante' })
  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-()]{6,20}$/)
  telefono?: string;

  @ApiPropertyOptional({ description: 'Población del visitante' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  poblacion?: string;

  @ApiProperty({
    description: 'Aceptación de la política de privacidad (obligatorio)',
  })
  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar la política de privacidad' })
  acceptedPrivacyPolicy: boolean;

  @ApiPropertyOptional({
    description: 'Aceptación de comunicaciones comerciales',
  })
  @IsOptional()
  @IsBoolean()
  acceptedMarketing?: boolean;

  @ApiPropertyOptional({
    type: [LeadCaptureAnswerDto],
    description: 'Respuestas del guion, en el orden en que se recorrió',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => LeadCaptureAnswerDto)
  answers?: LeadCaptureAnswerDto[];
}
