import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestContactDataDto {
  @ApiPropertyOptional({
    description: 'Mensaje del comercial que encabeza el formulario',
    example: 'Para atenderte mejor, necesitamos unos datos.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  preface?: string;
}
