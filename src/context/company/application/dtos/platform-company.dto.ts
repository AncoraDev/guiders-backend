import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { SiteDto } from './create-company.dto';
import { CompanySiteDto } from './get-company-sites-response.dto';

/** Resumen de company para listado platform */
export class PlatformCompanySummaryDto {
  @ApiProperty({ description: 'Identificador único de la empresa' })
  id!: string;

  @ApiProperty({ description: 'Nombre de la empresa' })
  companyName!: string;

  @ApiProperty({
    description: 'Dominios (canónicos y alias)',
    type: [String],
  })
  domains!: string[];

  @ApiProperty({ description: 'Fecha de creación (ISO)' })
  createdAt!: string;

  static fromPrimitives(primitives: {
    id: string;
    companyName: string;
    sites: Array<{
      canonicalDomain: string;
      domainAliases: string[];
    }>;
    createdAt: string;
  }): PlatformCompanySummaryDto {
    const domains: string[] = [];
    for (const site of primitives.sites) {
      domains.push(site.canonicalDomain);
      domains.push(...site.domainAliases);
    }
    const dto = new PlatformCompanySummaryDto();
    dto.id = primitives.id;
    dto.companyName = primitives.companyName;
    dto.domains = domains;
    dto.createdAt = primitives.createdAt;
    return dto;
  }
}

/** Detalle de company para platform */
export class PlatformCompanyDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  companyName!: string;

  @ApiProperty({ type: [CompanySiteDto] })
  sites!: CompanySiteDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  static fromPrimitives(primitives: {
    id: string;
    companyName: string;
    sites: CompanySiteDto[];
    createdAt: string;
    updatedAt: string;
  }): PlatformCompanyDetailDto {
    const dto = new PlatformCompanyDetailDto();
    dto.id = primitives.id;
    dto.companyName = primitives.companyName;
    dto.sites = primitives.sites;
    dto.createdAt = primitives.createdAt;
    dto.updatedAt = primitives.updatedAt;
    return dto;
  }
}

/** Respuesta al crear company + admin */
export class PlatformCreateCompanyResponseDto {
  @ApiProperty()
  companyId!: string;

  @ApiProperty()
  adminUserId!: string;
}

/** Body para actualizar company (nombre y sitios) */
export class UpdateCompanyDto {
  @ApiProperty({ description: 'Nombre de la empresa' })
  @IsString({ message: 'El nombre de la empresa es obligatorio' })
  @IsNotEmpty({ message: 'El nombre de la empresa es obligatorio' })
  companyName!: string;

  @ApiProperty({
    description: 'Sitios web de la empresa',
    type: [SiteDto],
  })
  @IsArray({ message: 'Se debe proporcionar al menos un sitio' })
  @ValidateNested({ each: true })
  @Type(() => SiteDto)
  sites!: SiteDto[];
}

/** Body para crear API key widget en una company */
export class PlatformCreateApiKeyDto {
  @ApiProperty({
    description: 'Dominio para el cual se crea o reutiliza la API Key',
    example: 'example.com',
  })
  @IsString()
  @IsNotEmpty()
  domain!: string;
}
