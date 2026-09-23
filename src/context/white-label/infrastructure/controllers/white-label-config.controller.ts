/**
 * Controller para gestión de configuración White Label
 */

import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiNotFoundError,
  ApiValidationError,
} from 'src/context/shared/infrastructure/swagger';
import {
  IWhiteLabelConfigRepository,
  WHITE_LABEL_CONFIG_REPOSITORY,
} from '../../domain/white-label-config.repository';
import {
  WhiteLabelConfig,
  ALLOWED_FONT_FAMILIES,
} from '../../domain/entities/white-label-config';
import { InMemoryTtlCache } from 'src/context/shared/infrastructure/cache/in-memory-ttl-cache';
import {
  WhiteLabelConfigResponseDto,
  UpdateWhiteLabelConfigDto,
  UploadResponseDto,
  WhiteLabelDefaultsDto,
  FontFileDto,
} from '../../application/dtos/white-label-config.dto';
import { WhiteLabelFileUploadService } from '../services/white-label-file-upload.service';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

@ApiTags('White Label Configuration')
@ApiAuthErrors()
@ApiInternalServerError()
@Controller('v2/companies/:companyId/white-label')
@UseGuards(DualAuthGuard, RolesGuard)
@ApiBearerAuth()
@ApiCookieAuth('access_token')
@ApiAuthErrors()
export class WhiteLabelConfigController {
  private readonly logger = new Logger(WhiteLabelConfigController.name);

  constructor(
    @Inject(WHITE_LABEL_CONFIG_REPOSITORY)
    private readonly configRepository: IWhiteLabelConfigRepository,
    private readonly fileUploadService: WhiteLabelFileUploadService,
    private readonly cache: InMemoryTtlCache<string, WhiteLabelConfig>,
  ) {}

  // ========================================
  // CONFIGURATION ENDPOINTS
  // ========================================

  @Get('defaults')
  @Roles(['admin', 'superadmin'])
  @ApiOperation({
    summary: 'Obtener valores por defecto de White Label',
    description:
      'Devuelve la paleta de colores, fuentes disponibles y fuente por defecto que el sistema aplica cuando una empresa no ha personalizado su configuración. Útil para inicializar formularios de configuración en el frontend.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiResponse({
    status: 200,
    description: 'Valores por defecto',
    type: WhiteLabelDefaultsDto,
  })
  getDefaults(): WhiteLabelDefaultsDto {
    this.logger.debug('Obteniendo valores por defecto de White Label');

    return {
      colors: {
        primary: '#007bff',
        secondary: '#6c757d',
        tertiary: '#17a2b8',
        background: '#ffffff',
        surface: '#f8f9fa',
        text: '#212529',
        textMuted: '#6c757d',
      },
      availableFonts: [...ALLOWED_FONT_FAMILIES],
      defaultFont: 'Inter',
    };
  }

  @Get()
  @Roles(['admin', 'superadmin', 'commercial'])
  @ApiOperation({
    summary: 'Obtener configuración White Label de una empresa',
    description:
      'Devuelve la configuración White Label persistida para la empresa indicada. Si la empresa aún no tiene configuración, devuelve una configuración por defecto generada en memoria (no se persiste). No tiene side-effects de escritura.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiResponse({
    status: 200,
    description: 'Configuración encontrada',
    type: WhiteLabelConfigResponseDto,
  })
  @ApiNotFoundError(
    'Configuración',
    'Configuración no encontrada - se devuelven valores por defecto',
  )
  async getConfig(
    @Param('companyId') companyId: string,
  ): Promise<WhiteLabelConfigResponseDto> {
    this.logger.debug(
      `Obteniendo configuración White Label para empresa ${companyId}`,
    );

    const result = await this.configRepository.findByCompanyId(companyId);

    if (result.isErr()) {
      // Si no existe, devolver configuración por defecto
      const defaultConfig = WhiteLabelConfig.createDefault(
        Uuid.random().value,
        companyId,
        '',
      );
      return this.toResponseDto(defaultConfig);
    }

    return this.toResponseDto(result.unwrap());
  }

  @Patch()
  @Roles(['admin', 'superadmin'])
  @ApiOperation({
    summary: 'Actualizar configuración White Label (upsert)',
    description:
      'Actualiza parcialmente la configuración White Label de la empresa (colores, branding, tipografía, tema). Si no existe configuración previa, se crea una nueva a partir de los valores por defecto y se le aplican los cambios recibidos. Operación idempotente sobre los campos enviados.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiResponse({
    status: 200,
    description: 'Configuración actualizada',
    type: WhiteLabelConfigResponseDto,
  })
  @ApiValidationError()
  async updateConfig(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateWhiteLabelConfigDto,
  ): Promise<WhiteLabelConfigResponseDto> {
    this.logger.debug(
      `Actualizando configuración White Label para empresa ${companyId}`,
    );

    // Obtener configuración existente o crear una por defecto
    let config: WhiteLabelConfig;
    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isOk()) {
      config = existingResult.unwrap();
    } else {
      // Crear configuración por defecto si no existe
      config = WhiteLabelConfig.createDefault(
        Uuid.random().value,
        companyId,
        dto.branding?.brandName || '',
      );
    }

    // Aplicar actualizaciones
    const updatedConfig = config.update({
      colors: dto.colors,
      branding: dto.branding,
      typography: dto.typography,
      theme: dto.theme,
      embed:
        dto.embedEnabled !== undefined || dto.embedAllowedOrigins !== undefined
          ? {
              embedEnabled: dto.embedEnabled,
              embedAllowedOrigins: dto.embedAllowedOrigins,
            }
          : undefined,
    });

    const saveResult = await this.configRepository.save(updatedConfig);

    if (saveResult.isErr()) {
      throw new BadRequestException(saveResult.error.message);
    }

    // Story 4.3: invalidate cache so next read (Story 4.1 GET /embed/start
    // or Angular BrandingService) refreshes from MongoDB with new values.
    this.cache.delete(companyId);
    this.logger.debug(
      `Cache invalidated for company=${companyId} after PATCH white-label`,
    );

    return this.toResponseDto(updatedConfig);
  }

  @Delete()
  @Roles(['admin', 'superadmin'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar/resetear configuración White Label',
    description:
      'Elimina por completo la configuración White Label de la empresa, incluyendo logo, favicon y todas las fuentes personalizadas almacenadas. Tras esta operación, los endpoints de lectura devolverán los valores por defecto. Operación destructiva e irreversible.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiResponse({ status: 204, description: 'Configuración eliminada' })
  async deleteConfig(@Param('companyId') companyId: string): Promise<void> {
    this.logger.debug(
      `Eliminando configuración White Label para empresa ${companyId}`,
    );

    // Obtener config existente para eliminar archivos asociados
    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isOk()) {
      const config = existingResult.unwrap();
      const primitives = config.toPrimitives();

      // Eliminar archivos del storage
      const filesToDelete: string[] = [];
      if (primitives.branding.logoUrl) {
        filesToDelete.push(primitives.branding.logoUrl);
      }
      if (primitives.branding.faviconUrl) {
        filesToDelete.push(primitives.branding.faviconUrl);
      }
      for (const font of primitives.typography.customFontFiles) {
        filesToDelete.push(font.url);
      }

      if (filesToDelete.length > 0) {
        await this.fileUploadService.deleteFiles(filesToDelete);
      }
    }

    // Eliminar de la base de datos (no lanza error si no existe)
    await this.configRepository.delete(companyId);

    // Story 4.3: invalidate cache so next read refreshes (will return default
    // branding since the config no longer exists).
    this.cache.delete(companyId);
    this.logger.debug(
      `Cache invalidated for company=${companyId} after DELETE white-label`,
    );
  }

  // ========================================
  // LOGO ENDPOINTS
  // ========================================

  @Post('logo')
  @Roles(['admin', 'superadmin'])
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir logo de la empresa',
    description:
      'Sube un nuevo archivo de logo (PNG, JPEG o SVG, máx. 2MB) al storage configurado y actualiza la URL del logo en la configuración White Label. Si ya existía un logo previo, se elimina del storage antes de guardar el nuevo. Si no existe configuración previa, se crea una por defecto.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (PNG, JPEG, SVG). Máximo 2MB.',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Logo subido correctamente',
    type: UploadResponseDto,
  })
  @ApiValidationError('Archivo inválido')
  async uploadLogo(
    @Param('companyId') companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    this.logger.debug(`Subiendo logo para empresa ${companyId}`);

    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    // Subir archivo
    const url = await this.fileUploadService.uploadLogo(file, companyId);

    // Actualizar configuración
    await this.updateConfigWithLogoUrl(companyId, url);

    return { url };
  }

  @Delete('logo')
  @Roles(['admin', 'superadmin'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar logo de la empresa',
    description:
      'Elimina el archivo de logo del storage y borra la referencia en la configuración. Requiere que exista configuración White Label para la empresa. Si no hay logo configurado, no realiza ninguna acción.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiResponse({ status: 204, description: 'Logo eliminado' })
  @ApiNotFoundError('Configuración', 'No hay logo configurado')
  async deleteLogo(@Param('companyId') companyId: string): Promise<void> {
    this.logger.debug(`Eliminando logo para empresa ${companyId}`);

    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isErr()) {
      throw new NotFoundException(
        'No existe configuración White Label para esta empresa',
      );
    }

    const config = existingResult.unwrap();
    const primitives = config.toPrimitives();

    if (!primitives.branding.logoUrl) {
      return; // No hay logo, nada que hacer
    }

    // Eliminar archivo del storage
    await this.fileUploadService.deleteFile(primitives.branding.logoUrl);

    // Actualizar configuración
    const updatedConfig = config.updateLogoUrl(null);
    await this.configRepository.save(updatedConfig);
  }

  // ========================================
  // FAVICON ENDPOINTS
  // ========================================

  @Post('favicon')
  @Roles(['admin', 'superadmin'])
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir favicon de la empresa',
    description:
      'Sube un nuevo archivo de favicon (PNG o ICO, máx. 500KB) al storage configurado y actualiza la URL del favicon en la configuración White Label. Si ya existía un favicon previo, se elimina del storage antes de guardar el nuevo. Si no existe configuración previa, se crea una por defecto.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de icono (PNG, ICO). Máximo 500KB.',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Favicon subido correctamente',
    type: UploadResponseDto,
  })
  @ApiValidationError('Archivo inválido')
  async uploadFavicon(
    @Param('companyId') companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    this.logger.debug(`Subiendo favicon para empresa ${companyId}`);

    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    // Subir archivo
    const url = await this.fileUploadService.uploadFavicon(file, companyId);

    // Actualizar configuración
    await this.updateConfigWithFaviconUrl(companyId, url);

    return { url };
  }

  @Delete('favicon')
  @Roles(['admin', 'superadmin'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar favicon de la empresa',
    description:
      'Elimina el archivo de favicon del storage y borra la referencia en la configuración. Requiere que exista configuración White Label para la empresa. Si no hay favicon configurado, no realiza ninguna acción.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiResponse({ status: 204, description: 'Favicon eliminado' })
  @ApiNotFoundError('Configuración', 'No hay favicon configurado')
  async deleteFavicon(@Param('companyId') companyId: string): Promise<void> {
    this.logger.debug(`Eliminando favicon para empresa ${companyId}`);

    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isErr()) {
      throw new NotFoundException(
        'No existe configuración White Label para esta empresa',
      );
    }

    const config = existingResult.unwrap();
    const primitives = config.toPrimitives();

    if (!primitives.branding.faviconUrl) {
      return; // No hay favicon, nada que hacer
    }

    // Eliminar archivo del storage
    await this.fileUploadService.deleteFile(primitives.branding.faviconUrl);

    // Actualizar configuración
    const updatedConfig = config.updateFaviconUrl(null);
    await this.configRepository.save(updatedConfig);
  }

  // ========================================
  // FONT ENDPOINTS
  // ========================================

  @Post('font')
  @Roles(['admin', 'superadmin'])
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir archivo de fuente personalizada',
    description:
      'Sube un archivo de fuente (TTF, OTF, WOFF o WOFF2, máx. 5MB) al storage y lo añade al listado de fuentes personalizadas de la empresa. Permite múltiples fuentes acumuladas (no reemplaza). Si no existe configuración previa, se crea una por defecto.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de fuente (TTF, OTF, WOFF, WOFF2). Máximo 5MB.',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Fuente subida correctamente',
    type: FontFileDto,
  })
  @ApiValidationError('Archivo inválido')
  async uploadFont(
    @Param('companyId') companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FontFileDto> {
    this.logger.debug(`Subiendo fuente para empresa ${companyId}`);

    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    // Subir archivo
    const fontFile = await this.fileUploadService.uploadFont(file, companyId);

    // Actualizar configuración
    await this.addFontToConfig(companyId, fontFile);

    return fontFile;
  }

  @Delete('font/:fileName')
  @Roles(['admin', 'superadmin'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar archivo de fuente específico',
    description:
      'Elimina del storage el archivo de fuente identificado por su nombre y lo retira del listado de fuentes personalizadas de la empresa. Requiere configuración existente; si la fuente no existe, devuelve 404.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiParam({ name: 'fileName', description: 'Nombre del archivo de fuente' })
  @ApiResponse({ status: 204, description: 'Fuente eliminada' })
  @ApiNotFoundError('Recurso')
  async deleteFont(
    @Param('companyId') companyId: string,
    @Param('fileName') fileName: string,
  ): Promise<void> {
    this.logger.debug(
      `Eliminando fuente ${fileName} para empresa ${companyId}`,
    );

    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isErr()) {
      throw new NotFoundException(
        'No existe configuración White Label para esta empresa',
      );
    }

    const config = existingResult.unwrap();
    const primitives = config.toPrimitives();

    // Buscar el archivo de fuente
    const fontFile = primitives.typography.customFontFiles.find(
      (f) => f.name === fileName,
    );

    if (!fontFile) {
      throw new NotFoundException(`No se encontró la fuente: ${fileName}`);
    }

    // Eliminar archivo del storage
    await this.fileUploadService.deleteFile(fontFile.url);

    // Actualizar configuración
    const updatedConfig = config.removeFontFile(fileName);
    await this.configRepository.save(updatedConfig);
  }

  @Delete('fonts')
  @Roles(['admin', 'superadmin'])
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar todas las fuentes personalizadas',
    description:
      'Elimina del storage todos los archivos de fuente subidos por la empresa y vacía el listado de fuentes personalizadas en la configuración. Si no existe configuración, no realiza ninguna acción. Operación destructiva e irreversible.',
  })
  @ApiParam({ name: 'companyId', description: 'ID de la empresa' })
  @ApiResponse({ status: 204, description: 'Todas las fuentes eliminadas' })
  async deleteAllFonts(@Param('companyId') companyId: string): Promise<void> {
    this.logger.debug(`Eliminando todas las fuentes para empresa ${companyId}`);

    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isErr()) {
      return; // No hay configuración, nada que hacer
    }

    const config = existingResult.unwrap();
    const primitives = config.toPrimitives();

    // Eliminar todos los archivos del storage
    const fontUrls = primitives.typography.customFontFiles.map((f) => f.url);
    if (fontUrls.length > 0) {
      await this.fileUploadService.deleteFiles(fontUrls);
    }

    // Actualizar configuración
    const updatedConfig = config.removeAllFontFiles();
    await this.configRepository.save(updatedConfig);
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Convierte WhiteLabelConfig a DTO de respuesta
   */
  private toResponseDto(config: WhiteLabelConfig): WhiteLabelConfigResponseDto {
    const primitives = config.toPrimitives();

    return {
      id: primitives.id,
      companyId: primitives.companyId,
      colors: primitives.colors,
      branding: primitives.branding,
      typography: {
        fontFamily: primitives.typography.fontFamily,
        customFontName: primitives.typography.customFontName || null,
        customFontFiles: primitives.typography.customFontFiles,
      },
      theme: primitives.theme,
      embedEnabled: primitives.embedEnabled,
      embedAllowedOrigins: primitives.embedAllowedOrigins,
      createdAt: primitives.createdAt,
      updatedAt: primitives.updatedAt,
    };
  }

  /**
   * Actualiza la configuración con una nueva URL de logo
   */
  private async updateConfigWithLogoUrl(
    companyId: string,
    url: string,
  ): Promise<void> {
    let config: WhiteLabelConfig;
    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isOk()) {
      config = existingResult.unwrap();
      // Eliminar logo anterior si existe
      const primitives = config.toPrimitives();
      if (primitives.branding.logoUrl) {
        await this.fileUploadService.deleteFile(primitives.branding.logoUrl);
      }
    } else {
      config = WhiteLabelConfig.createDefault(
        Uuid.random().value,
        companyId,
        '',
      );
    }

    const updatedConfig = config.updateLogoUrl(url);
    await this.configRepository.save(updatedConfig);
  }

  /**
   * Actualiza la configuración con una nueva URL de favicon
   */
  private async updateConfigWithFaviconUrl(
    companyId: string,
    url: string,
  ): Promise<void> {
    let config: WhiteLabelConfig;
    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isOk()) {
      config = existingResult.unwrap();
      // Eliminar favicon anterior si existe
      const primitives = config.toPrimitives();
      if (primitives.branding.faviconUrl) {
        await this.fileUploadService.deleteFile(primitives.branding.faviconUrl);
      }
    } else {
      config = WhiteLabelConfig.createDefault(
        Uuid.random().value,
        companyId,
        '',
      );
    }

    const updatedConfig = config.updateFaviconUrl(url);
    await this.configRepository.save(updatedConfig);
  }

  /**
   * Añade un archivo de fuente a la configuración
   */
  private async addFontToConfig(
    companyId: string,
    fontFile: { name: string; url: string },
  ): Promise<void> {
    let config: WhiteLabelConfig;
    const existingResult =
      await this.configRepository.findByCompanyId(companyId);

    if (existingResult.isOk()) {
      config = existingResult.unwrap();
    } else {
      config = WhiteLabelConfig.createDefault(
        Uuid.random().value,
        companyId,
        '',
      );
    }

    const updatedConfig = config.addFontFile(fontFile);
    await this.configRepository.save(updatedConfig);
  }
}
