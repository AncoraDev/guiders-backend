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
}

export class CompanyLeadCaptureNotifyDto {
  @ApiPropertyOptional({
    description: 'Email de avisos de captación',
  })
  email: string;
}
