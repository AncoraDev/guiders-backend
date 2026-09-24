import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import {
  ApiAuthErrors,
  ApiInternalServerError,
} from 'src/context/shared/infrastructure/swagger';
import { GithubSdkReleasesService } from '../services/github-sdk-releases.service';
import { SdkReleaseView } from '../../application/sdk-releases/map-github-sdk-releases';

export class SdkReleaseDto implements SdkReleaseView {
  @ApiProperty({ description: 'Versión publicada (sin la v del tag)' })
  version!: string;

  @ApiProperty({
    description: 'Fecha de publicación (ISO)',
    nullable: true,
  })
  publishedAt!: string | null;

  @ApiProperty({
    description: 'true si es alpha, beta o rc. WordPress no la instala solo.',
  })
  prerelease!: boolean;

  @ApiProperty({ description: 'Notas del release' })
  notes!: string;

  @ApiProperty({
    description: 'URL del ZIP del plugin de WordPress',
    nullable: true,
  })
  wordpressZipUrl!: string | null;

  @ApiProperty({
    description: 'URL de guiders-sdk.min.js para webs que no son WordPress',
    nullable: true,
  })
  webScriptUrl!: string | null;
}

/**
 * Registro de versiones del SDK para el equipo Guiders.
 * El origen es el release de GitHub; no hay copia en base de datos.
 */
@ApiTags('platform')
@ApiBearerAuth()
@ApiAuthErrors()
@ApiInternalServerError()
@UseGuards(DualAuthGuard, RolesGuard)
@Roles(['superadmin'])
@Controller('platform/sdk-releases')
export class PlatformSdkReleasesController {
  constructor(private readonly releases: GithubSdkReleasesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar versiones del SDK',
    description:
      'De la más reciente a la más antigua. Incluye el ZIP de WordPress y, si existe, el script para la web.',
  })
  @ApiResponse({ status: 200, type: [SdkReleaseDto] })
  list(): Promise<SdkReleaseDto[]> {
    return this.releases.list();
  }
}
