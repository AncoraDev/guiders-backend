import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellidos?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  poblacion?: string;
}
