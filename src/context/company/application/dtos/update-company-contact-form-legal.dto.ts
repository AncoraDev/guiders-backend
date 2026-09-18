import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyContactFormLegalDto {
  @ApiPropertyOptional({
    description: 'URL de la política de privacidad',
    example: 'https://ejemplo.com/privacidad',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  privacyPolicyUrl?: string;

  @ApiPropertyOptional({
    description: 'Texto del check RGPD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  privacyCheckboxLabel?: string;

  @ApiPropertyOptional({
    description: 'Texto del check de comunicaciones',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  marketingCheckboxLabel?: string;
}
