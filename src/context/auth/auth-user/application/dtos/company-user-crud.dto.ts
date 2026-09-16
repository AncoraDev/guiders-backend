import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  ArrayMinSize,
  MinLength,
} from 'class-validator';

export class CreateCompanyUserRequestDto {
  @ApiProperty({ example: 'Ana' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  firstName: string;

  @ApiPropertyOptional({ example: 'García López' })
  @IsOptional()
  @IsString({ message: 'Los apellidos deben ser una cadena de texto' })
  lastName?: string;

  @ApiProperty({ example: 'ana@empresa.com' })
  @IsEmail({}, { message: 'El email no es válido' })
  email: string;

  @ApiPropertyOptional({ example: '+34600111222' })
  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  phone?: string;

  @ApiProperty({
    example: ['commercial'],
    description: 'Roles asignables: admin, commercial, supervisor',
    type: [String],
  })
  @IsArray({ message: 'roles debe ser un array' })
  @ArrayMinSize(1, { message: 'Debes asignar al menos un rol' })
  @IsString({ each: true, message: 'Cada rol debe ser una cadena de texto' })
  roles: string[];

  @ApiProperty({
    example: 'admin123!',
    description:
      'Contraseña temporal (mín. 6). En el primer login Keycloak exige una nueva con política segura.',
  })
  @IsString({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña temporal debe tener al menos 6 caracteres' })
  temporaryPassword: string;
}

export class UpdateCompanyUserRequestDto {
  @ApiPropertyOptional({ example: 'Ana García' })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name?: string;

  @ApiPropertyOptional({ example: 'ana@empresa.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El email no es válido' })
  email?: string;

  @ApiPropertyOptional({
    example: ['admin', 'commercial'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'roles debe ser un array' })
  @ArrayMinSize(1, { message: 'Debes asignar al menos un rol' })
  @IsString({ each: true, message: 'Cada rol debe ser una cadena de texto' })
  roles?: string[];

  @ApiPropertyOptional({
    example: 'Admin123!',
    description:
      'Contraseña definitiva (mín. 6). El usuario entra con ella; no se pide cambio en el login.',
  })
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password?: string;
}

export class SetCompanyUserActiveRequestDto {
  @ApiProperty({ example: true })
  @IsBoolean({ message: 'isActive debe ser boolean' })
  isActive: boolean;
}

export class CompanyUserMutationResponseDto {
  @ApiProperty({ example: 'uuid' })
  userId: string;
}
