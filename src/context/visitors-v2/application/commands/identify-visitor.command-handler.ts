import {
  CommandHandler,
  ICommandHandler,
  EventPublisher,
  CommandBus,
} from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { IdentifyVisitorCommand } from './identify-visitor.command';
import { IdentifyVisitorResponseDto } from '../dtos/identify-visitor-response.dto';
import {
  VisitorV2Repository,
  VISITOR_V2_REPOSITORY,
} from '../../domain/visitor-v2.repository';
import { VisitorV2 } from '../../domain/visitor-v2.aggregate';
import { VisitorId } from '../../domain/value-objects/visitor-id';
import { TenantId } from '../../domain/value-objects/tenant-id';
import { SiteId } from '../../domain/value-objects/site-id';
import { VisitorFingerprint } from '../../domain/value-objects/visitor-fingerprint';
import {
  VisitorLifecycleVO,
  VisitorLifecycle,
} from '../../domain/value-objects/visitor-lifecycle';
import {
  CompanyRepository,
  COMPANY_REPOSITORY,
} from '../../../company/domain/company.repository';
import {
  ValidateDomainApiKey,
  VALIDATE_DOMAIN_API_KEY,
} from '../../../auth/auth-visitor/application/services/validate-domain-api-key';
import { VisitorAccountApiKey } from '../../../auth/auth-visitor/domain/models/visitor-account-api-key';
import { RecordConsentCommand } from '../../../consent/application/commands/record-consent.command';
import { DenyConsentCommand } from '../../../consent/application/commands/deny-consent.command';
import { BadRequestException } from '@nestjs/common';
import { getCurrentConsentVersion } from '../../../consent/domain/config/consent-version.config';
import { GoOnlineVisitorCommand } from './go-online-visitor.command';
import {
  CommercialRepository,
  COMMERCIAL_REPOSITORY,
} from '../../../commercial/domain/commercial.repository';
import {
  domainsMatch,
  normalizeDomainForMatching,
} from '../../../shared/domain/domain-matching.util';
import { BffSessionAuthService } from '../../../shared/infrastructure/services/bff-session-auth.service';

@CommandHandler(IdentifyVisitorCommand)
export class IdentifyVisitorCommandHandler
  implements ICommandHandler<IdentifyVisitorCommand, IdentifyVisitorResponseDto>
{
  private readonly logger = new Logger(IdentifyVisitorCommandHandler.name);

  constructor(
    @Inject(VISITOR_V2_REPOSITORY)
    private readonly visitorRepository: VisitorV2Repository,
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
    @Inject(VALIDATE_DOMAIN_API_KEY)
    private readonly apiKeyValidator: ValidateDomainApiKey,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercialRepository: CommercialRepository,
    private readonly bffSessionAuthService: BffSessionAuthService,
    private readonly publisher: EventPublisher,
    private readonly commandBus: CommandBus,
  ) {}

  /**
   * Detecta si el visitante es un comercial mediante cookie de sesión BFF
   * Extrae y valida tokens JWT de cookies como 'console_session'
   * Si el token es válido y contiene rol 'commercial', retorna true
   */
  private async isCommercialByBffSession(
    cookieHeader?: string,
  ): Promise<boolean> {
    if (!cookieHeader) {
      return false;
    }

    try {
      this.logger.debug(`Verificando si visitante es comercial vía sesión BFF`);

      const tokens =
        this.bffSessionAuthService.extractBffSessionTokens(cookieHeader);

      if (tokens.length === 0) {
        this.logger.debug(`No se encontraron tokens BFF en cookies`);
        return false;
      }

      for (const token of tokens) {
        const userInfo =
          await this.bffSessionAuthService.validateBffSession(token);

        if (userInfo && userInfo.roles.includes('commercial')) {
          this.logger.log(
            `✅ Sesión BFF válida detectada: comercial ${userInfo.sub} (${userInfo.email ?? 'sin email'})`,
          );
          return true;
        }
      }

      this.logger.debug(
        `Token(s) BFF encontrados pero ninguno con rol 'commercial'`,
      );
      return false;
    } catch (error) {
      this.logger.warn(
        `Error al verificar sesión BFF de comercial: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Detecta si el visitante es en realidad un comercial autenticado
   * Verifica si el fingerprint pertenece a un comercial pre-registrado
   * Esto funciona incluso si el SDK y la consola están en dominios diferentes
   */
  private async isCommercialByFingerprint(
    fingerprint: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      this.logger.debug(
        `Verificando si fingerprint ${fingerprint} pertenece a comercial en tenant ${tenantId}`,
      );

      const result = await this.commercialRepository.findByFingerprintAndTenant(
        fingerprint,
        tenantId,
      );

      if (result.isErr()) {
        this.logger.debug(
          `Error al buscar comercial por fingerprint: ${result.error.message}`,
        );
        return false;
      }

      const commercial = result.unwrap();

      if (!commercial) {
        this.logger.debug(
          `Fingerprint ${fingerprint} no pertenece a ningún comercial`,
        );
        return false;
      }

      this.logger.log(
        `✅ Fingerprint ${fingerprint} pertenece a comercial: ${commercial.id.value}`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Error al verificar fingerprint de comercial: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async execute(
    command: IdentifyVisitorCommand,
  ): Promise<IdentifyVisitorResponseDto> {
    try {
      // Normalizar dominio: ignorar www. y puerto (host:port ≡ host)
      const normalizedDomain = normalizeDomainForMatching(command.domain);

      this.logger.log(
        `Identificando visitante: fingerprint=${command.fingerprint}, domain=${command.domain}${command.domain !== normalizedDomain ? ` (normalizado a: ${normalizedDomain})` : ''}`,
      );

      // Validar API Key con dominio normalizado
      const apiKeyValid = await this.apiKeyValidator.validate({
        apiKey: new VisitorAccountApiKey(command.apiKey),
        domain: normalizedDomain,
      });

      if (!apiKeyValid) {
        throw new Error('API Key inválida para el dominio proporcionado');
      }

      // RGPD: Manejar rechazo explícito de consentimiento
      if (!command.hasAcceptedPrivacyPolicy) {
        this.logger.log(
          `❌ Visitante rechazó el consentimiento. Creando visitante anónimo sin sesión.`,
        );

        // IMPORTANTE: Continuamos con el flujo para resolver empresa y sitio
        // porque necesitamos estos datos para crear el visitante
      }

      // Resolver dominio normalizado a tenantId y siteId
      const companyResult =
        await this.companyRepository.findByDomain(normalizedDomain);

      if (companyResult.isErr()) {
        throw new Error(
          `No se encontró una empresa para el dominio: ${normalizedDomain}`,
        );
      }

      const company = companyResult.value;
      const sites = company.getSites();
      const sitePrimitives = sites.toPrimitives();

      this.logger.log(`🏢 Empresa encontrada: ${company.getId().getValue()}`);
      this.logger.log(`🌐 Sitios disponibles: ${sitePrimitives.length}`);
      sitePrimitives.forEach((site, index) => {
        this.logger.log(
          `   ${index + 1}. ID: ${site.id}, domain: ${site.canonicalDomain}, aliases: ${JSON.stringify(site.domainAliases)}`,
        );
      });

      const targetSite = sitePrimitives.find(
        (site) =>
          domainsMatch(site.canonicalDomain, normalizedDomain) ||
          site.domainAliases.some((alias) =>
            domainsMatch(alias, normalizedDomain),
          ),
      );

      if (!targetSite) {
        throw new Error(
          `No se encontró un sitio específico para el dominio: ${normalizedDomain}`,
        );
      }

      this.logger.log(
        `🎯 Sitio seleccionado: ID=${targetSite.id}, domain=${targetSite.canonicalDomain}`,
      );

      // Crear value objects
      const fingerprint = new VisitorFingerprint(command.fingerprint);
      const siteId = new SiteId(targetSite.id);
      const tenantId = new TenantId(company.getId().getValue());

      // Declarar consentVersion una sola vez para usar en ambos flujos
      const consentVersion: string =
        command.consentVersion || getCurrentConsentVersion();

      // ========================================================================
      // MANEJO ESPECIAL: Usuario rechazó el consentimiento
      // ========================================================================
      if (!command.hasAcceptedPrivacyPolicy) {
        this.logger.log(
          `🚫 Procesando rechazo de consentimiento para fingerprint=${fingerprint.value}`,
        );

        // Detectar si es un comercial autenticado vía BFF session o fingerprint
        let isInternal = await this.isCommercialByBffSession(
          command.cookieHeader,
        );
        if (!isInternal) {
          isInternal = await this.isCommercialByFingerprint(
            command.fingerprint,
            tenantId.value,
          );
        }

        // Crear visitante anónimo SIN sesión
        const visitor = VisitorV2.create({
          id: VisitorId.random(),
          tenantId,
          siteId,
          fingerprint,
          lifecycle: new VisitorLifecycleVO(VisitorLifecycle.ANON),
          isInternal,
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
        });

        // Guardar visitante
        const visitorContext = this.publisher.mergeObjectContext(visitor);
        const saveResult = await this.visitorRepository.save(visitorContext);

        if (saveResult.isErr()) {
          this.logger.error(
            `Error al guardar visitante que rechazó: ${saveResult.error.message}`,
          );
          throw new BadRequestException(
            'No se pudo procesar el rechazo de consentimiento',
          );
        }

        visitorContext.commit();

        // Registrar rechazo de consentimiento
        try {
          const denyCommand = new DenyConsentCommand(
            visitor.getId().value,
            'privacy_policy' as string,
            command.ipAddress,
            command.userAgent,
            {
              fingerprint: command.fingerprint,
              domain: normalizedDomain,
              currentUrl: command.currentUrl,
              reason: 'User explicitly denied consent',
            } as Record<string, unknown>,
          );

          await this.commandBus.execute(denyCommand);
          this.logger.log(
            `✅ Rechazo de consentimiento registrado para: ${visitor.getId().value}`,
          );
        } catch (error: unknown) {
          this.logger.error(
            'Error al registrar rechazo de consentimiento:',
            error instanceof Error ? error.message : String(error),
          );
        }

        // Retornar respuesta con consentimiento rechazado
        throw new BadRequestException({
          message:
            'Se requiere aceptar la política de privacidad para usar todas las funciones',
          visitorId: visitor.getId().value,
          sessionId: null,
          lifecycle: visitor.getLifecycle().getValue(),
          isNewVisitor: true,
          consentStatus: 'denied',
          allowedActions: ['read_only'],
        });
      }

      // ========================================================================
      // FLUJO NORMAL: Usuario aceptó el consentimiento
      // ========================================================================
      this.logger.log(
        `Buscando visitante existente: fingerprint=${fingerprint.value}, siteId=${siteId.value}`,
      );

      // Buscar visitante existente por fingerprint y siteId
      const existingVisitorResult =
        await this.visitorRepository.findByFingerprintAndSite(
          fingerprint,
          siteId,
        );

      let visitor: VisitorV2;
      let isNewVisitor = false;

      if (existingVisitorResult.isOk()) {
        // Visitante existente - actualizar con nueva sesión
        visitor = existingVisitorResult.value;
        this.logger.log(
          `✅ Visitante existente encontrado: ${visitor.getId().value}`,
        );

        // Sincronizar isInternal si ahora se detecta como comercial (vía BFF session o fingerprint)
        if (!visitor.getIsInternal()) {
          let isInternal = await this.isCommercialByBffSession(
            command.cookieHeader,
          );
          if (!isInternal) {
            isInternal = await this.isCommercialByFingerprint(
              command.fingerprint,
              tenantId.value,
            );
          }
          if (isInternal) {
            visitor = visitor.markAsInternal();
            this.logger.log(
              `🔄 Visitante existente marcado como interno (comercial detectado)`,
            );
          }
        }

        // Iniciar nueva sesión con IP y userAgent
        visitor.startNewSession(command.ipAddress, command.userAgent);

        // RGPD: Actualizar consentimiento si no existe o si la versión cambió
        if (!visitor.hasValidConsent()) {
          visitor.acceptPrivacyPolicy(consentVersion);
          this.logger.log(
            `📝 Consentimiento actualizado para visitante existente: ${visitor.getId().value}`,
          );
        }
      } else {
        // Visitante nuevo - crear con estado anónimo
        isNewVisitor = true;
        this.logger.log(
          `❌ Visitante NO encontrado. Razón: ${existingVisitorResult.error.message}`,
        );
        this.logger.log('🆕 Creando nuevo visitante anónimo');

        // Detectar si es un comercial autenticado (vía BFF session o fingerprint)
        let isInternal = await this.isCommercialByBffSession(
          command.cookieHeader,
        );
        if (!isInternal) {
          isInternal = await this.isCommercialByFingerprint(
            command.fingerprint,
            tenantId.value,
          );
        }
        if (isInternal) {
          this.logger.log(
            '🔒 Visitante marcado como interno (comercial detectado)',
          );
        }

        visitor = VisitorV2.create({
          id: VisitorId.random(),
          tenantId,
          siteId,
          fingerprint,
          lifecycle: new VisitorLifecycleVO(VisitorLifecycle.ANON),
          isInternal,
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
        });

        // RGPD: Registrar consentimiento para visitante nuevo
        visitor.acceptPrivacyPolicy(consentVersion);

        this.logger.log(`🆕 Nuevo visitante creado: ${visitor.getId().value}`);
      }

      // Actualizar currentUrl si se proporciona
      if (command.currentUrl) {
        visitor.updateCurrentUrl(command.currentUrl);
        this.logger.log(`📍 URL actual actualizada: ${command.currentUrl}`);
      }

      // Persistir cambios con eventos
      const visitorContext = this.publisher.mergeObjectContext(visitor);
      const saveResult = await this.visitorRepository.save(visitorContext);

      if (saveResult.isErr()) {
        this.logger.error(
          'Error al guardar visitante:',
          saveResult.error.message,
        );
        throw new Error('Error al guardar visitante');
      }

      // Commit eventos
      visitorContext.commit();

      // RGPD: Registrar consentimiento en el contexto de consentimientos
      // Esto crea un registro auditable del consentimiento según RGPD Art. 7.1
      try {
        const recordConsentCommand = new RecordConsentCommand(
          visitor.getId().value,
          'privacy_policy' as string, // ConsentType.PRIVACY_POLICY
          consentVersion,
          command.ipAddress,
          command.userAgent,
          {
            fingerprint: command.fingerprint,
            domain: normalizedDomain,
            currentUrl: command.currentUrl,
          } as Record<string, unknown>,
        );

        await this.commandBus.execute(recordConsentCommand);
        this.logger.log(
          `✅ Consentimiento registrado en contexto consent para visitante: ${visitor.getId().value}`,
        );
      } catch (error: unknown) {
        // No fallar toda la operación si falla el registro de consentimiento
        // pero sí loguear el error para investigación
        this.logger.error(
          'Error al registrar consentimiento en contexto consent:',
          error instanceof Error ? error.message : String(error),
        );
      }

      // Marcar visitante como online automáticamente
      // Esto notificará a los comerciales vía WebSocket que hay un nuevo visitante conectado
      try {
        await this.commandBus.execute(
          new GoOnlineVisitorCommand(visitor.getId().value),
        );
        this.logger.log(
          `✅ Visitante marcado como online automáticamente: ${visitor.getId().value}`,
        );
      } catch (error: unknown) {
        // No fallar toda la operación si falla marcar como online
        // El visitante puede hacerlo manualmente después
        this.logger.warn(
          `⚠️ Error al marcar visitante como online (no crítico): ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Obtener sesión activa
      const activeSessions = visitor.getActiveSessions();
      const currentSession = activeSessions[activeSessions.length - 1]; // La más reciente

      this.logger.log(
        `Visitante identificado exitosamente: ${visitor.getId().value}, sesión: ${currentSession.getId().value}`,
      );

      return new IdentifyVisitorResponseDto({
        visitorId: visitor.getId().value,
        tenantId: tenantId.value,
        sessionId: currentSession.getId().value,
        lifecycle: visitor.getLifecycle().getValue(),
        isNewVisitor,
        consentStatus: 'granted',
        allowedActions: ['chat', 'forms', 'tracking', 'all'],
      });
    } catch (error: unknown) {
      this.logger.error(
        'Error al identificar visitante:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
