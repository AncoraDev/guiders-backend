import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para actualizar datos de contacto de un lead por visitor ID
 * Todos los campos son opcionales y campos extra serán ignorados
 */
export class UpdateContactDataDto {
  @ApiPropertyOptional({
    description: 'Alias interno para identificar al contacto',
    example: 'Cliente VIP - Seat León',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  alias?: string;

  @ApiPropertyOptional({
    description: 'Nombre del contacto',
    example: 'Roger',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Apellidos del contacto',
    example: 'Puga Ruiz',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  apellidos?: string;

  @ApiPropertyOptional({
    description: 'Email del contacto',
    example: 'rogerpugaruiz@gmail.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Formato de email inválido' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Teléfono del contacto',
    example: '+34609252646',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string;

  @ApiPropertyOptional({
    description: 'Población del contacto',
    example: 'MOLINS DE REI',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  poblacion?: string;
}
