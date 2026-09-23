import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PublicWidgetConfigQueryDto {
  @ApiProperty({
    description: 'Dominio del sitio (sin www).',
    example: 'localhost',
  })
  @IsString()
  @IsNotEmpty()
  domain: string;

  @ApiProperty({
    description: 'API key del widget asociada al dominio.',
  })
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}
