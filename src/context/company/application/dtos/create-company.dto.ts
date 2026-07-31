// DTO para la creación de una empresa, siguiendo DDD y CQRS
import {
  IsString,
  ValidateNested,
  IsArray,
  IsOptional,
  IsEmail,
  IsNotEmpty,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// DTO para un sitio web de la empresa
export class SiteDto {
  @ApiProperty({
    description:
      'ID del sitio (opcional, se generará automáticamente si no se proporciona)',
    required: false,
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Nombre del sitio web' })
  @IsString({ message: 'El nombre del sitio es obligatorio' })
  name: string;

  @ApiProperty({ description: 'Dominio canónico del sitio' })
  @IsString({ message: 'El dominio canónico es obligatorio' })
  canonicalDomain: string;

  @ApiProperty({
    description: 'Lista de dominios alias (opcional)',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domainAliases?: string[];
}

// DTO para el administrador de la empresa
export class AdminDto {
  @ApiProperty({
    description: 'Nombre completo (legacy). Preferir adminFirstName + adminLastName',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'El nombre del administrador debe ser texto' })
  adminName?: string;

  @ApiProperty({ description: 'Nombre del administrador', required: false })
  @IsOptional()
  @IsString({ message: 'El nombre del administrador debe ser texto' })
  adminFirstName?: string;

  @ApiProperty({ description: 'Apellidos del administrador', required: false })
  @IsOptional()
  @IsString({ message: 'Los apellidos del administrador deben ser texto' })
  adminLastName?: string;

  @ApiProperty({ description: 'Email del administrador' })
  @IsEmail({}, { message: 'El email del administrador no es válido' })
  @IsNotEmpty({ message: 'El email del administrador es obligatorio' })
  adminEmail!: string;

  @ApiProperty({ description: 'Teléfono del administrador', required: false })
  @IsOptional()
  @IsString({ message: 'El teléfono del administrador debe ser texto' })
  adminTel?: string;

  @ApiProperty({
    description:
      'Contraseña temporal del admin (mín. 6). En el primer login Keycloak exige una nueva segura.',
    example: 'admin123!',
  })
  @IsString({ message: 'La contraseña temporal del administrador es obligatoria' })
  @IsNotEmpty({ message: 'La contraseña temporal del administrador es obligatoria' })
  @MinLength(6, {
    message: 'La contraseña temporal debe tener al menos 6 caracteres',
  })
  adminPassword!: string;
}

// DTO principal para crear una empresa
export class CreateCompanyDto {
  @ApiProperty({ description: 'Nombre de la empresa' })
  @IsString({ message: 'El nombre de la empresa es obligatorio' })
  companyName: string;

  @ApiProperty({
    description: 'Lista de sitios web de la empresa',
    type: [SiteDto],
  })
  @IsArray({ message: 'Se debe proporcionar al menos un sitio' })
  @ValidateNested({ each: true })
  @Type(() => SiteDto)
  sites: SiteDto[];

  @ApiProperty({ type: AdminDto, description: 'Datos del administrador' })
  @ValidateNested()
  @Type(() => AdminDto)
  admin: AdminDto;
}
