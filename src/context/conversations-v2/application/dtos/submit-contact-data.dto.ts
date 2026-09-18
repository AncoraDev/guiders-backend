import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SubmitContactDataDto {
  @ApiProperty({ description: 'Nombre del visitante' })
  @IsString()
  @MaxLength(100)
  nombre: string;

  @ApiProperty({ description: 'Email del visitante' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ description: 'Teléfono del visitante' })
  @IsString()
  @Matches(/^[+]?[\d\s\-()]{6,20}$/)
  telefono: string;

  @ApiProperty({ description: 'Población del visitante' })
  @IsString()
  @MaxLength(100)
  poblacion: string;

  @ApiProperty({
    description: 'Aceptación de la política de privacidad (obligatorio)',
  })
  @IsBoolean()
  @Equals(true, {
    message: 'Debes aceptar la política de privacidad',
  })
  acceptedPrivacyPolicy: boolean;

  @ApiProperty({
    description: 'Aceptación de comunicaciones comerciales (opcional)',
  })
  @IsBoolean()
  acceptedMarketing: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellidos?: string;
}
