import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class UpdateWidgetPositionDto {
  @ApiPropertyOptional({
    enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
  })
  @IsOptional()
  @IsIn(['bottom-right', 'bottom-left', 'top-right', 'top-left'])
  desktop?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mobileEnabled?: boolean;

  @ApiPropertyOptional({
    enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
  })
  @IsOptional()
  @IsIn(['bottom-right', 'bottom-left', 'top-right', 'top-left'])
  mobile?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export class UpdateCompanyWidgetConfigDto {
  @ApiPropertyOptional({ description: 'Mostrar el widget de chat en la web' })
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Abrir el chat cuando llega un mensaje del comercial',
  })
  @IsOptional()
  @IsBoolean()
  autoOpenChatOnMessage?: boolean;

  @ApiPropertyOptional({ enum: ['system', 'light', 'dark'] })
  @IsOptional()
  @IsIn(['system', 'light', 'dark'])
  colorScheme?: 'system' | 'light' | 'dark';

  @ApiPropertyOptional({ enum: ['default', 'carbon'] })
  @IsOptional()
  @IsIn(['default', 'carbon'])
  theme?: 'default' | 'carbon';

  @ApiPropertyOptional({ type: UpdateWidgetPositionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateWidgetPositionDto)
  position?: UpdateWidgetPositionDto;
}
