import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreatePlatformUserRequestDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Company destino del usuario',
  })
  @IsUUID('4', { message: 'companyId debe ser un UUID válido' })
  companyId: string;

  @ApiProperty({ example: 'Ana' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  firstName: string;

  @ApiProperty({ example: 'García López' })
  @IsString({ message: 'Los apellidos deben ser una cadena de texto' })
  lastName: string;

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
