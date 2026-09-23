import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyLeadCaptureNotifyDto {
  @ApiPropertyOptional({
    description:
      'Email que recibe el resumen cuando un visitante termina el asistente. Vacío para no enviar.',
    example: 'avisos@concesionario.com',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description:
      'Remitente verificado en Resend. Ejemplo: Guiders <no-reply@concesionario.com>',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  from?: string;

  @ApiPropertyOptional({
    description:
      'API key de Resend (re_…). Vacío = no cambiar la que ya está guardada.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiKey?: string;
}

export class CompanyLeadCaptureNotifyDto {
  email: string;
  from: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
}
