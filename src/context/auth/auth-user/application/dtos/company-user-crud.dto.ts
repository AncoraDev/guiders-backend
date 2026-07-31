import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';

export class CreateCompanyUserRequestDto {
  @ApiProperty({ example: 'Ana García' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name: string;

  @ApiProperty({ example: 'ana@empresa.com' })
  @IsEmail({}, { message: 'El email no es válido' })
  email: string;

  @ApiProperty({
    example: ['commercial'],
    description: 'Roles asignables: admin, commercial, supervisor',
    type: [String],
  })
  @IsArray({ message: 'roles debe ser un array' })
  @ArrayMinSize(1, { message: 'Debes asignar al menos un rol' })
  @IsString({ each: true, message: 'Cada rol debe ser una cadena de texto' })
  roles: string[];
}

export class UpdateCompanyUserRequestDto {
  @ApiPropertyOptional({ example: 'Ana García' })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name?: string;

  @ApiPropertyOptional({
    example: ['admin', 'commercial'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'roles debe ser un array' })
  @ArrayMinSize(1, { message: 'Debes asignar al menos un rol' })
  @IsString({ each: true, message: 'Cada rol debe ser una cadena de texto' })
  roles?: string[];
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
