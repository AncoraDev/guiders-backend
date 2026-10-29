import { AggregateRoot } from '@nestjs/cqrs';
import { VisitorId } from './value-objects/visitor-id';
import { TenantId } from './value-objects/tenant-id';
import { SiteId } from './value-objects/site-id';
import { VisitorFingerprint } from './value-objects/visitor-fingerprint';
import {
  VisitorLifecycle,
  VisitorLifecycleVO,
} from './value-objects/visitor-lifecycle';
import { ConnectionStatus } from './value-objects/visitor-connection';
import { Session } from './session.entity';
import { SessionId } from './value-objects/session-id';
import { VisitorCreatedEvent } from './events/visitor-created.event';
import { VisitorLifecycleChangedEvent } from './events/visitor-state-changed.event';
import { VisitorConnectionChangedEvent } from './events/visitor-connection-changed.event';
import {
  SessionStartedEvent,
  SessionEndedEvent,
} from './events/session.events';
import { VisitorCurrentPageChangedEvent } from './events/visitor-current-page-changed.event';
import { VisitorBlockedEvent } from './events/visitor-blocked.event';
import { VisitorUnblockedEvent } from './events/visitor-unblocked.event';
import {
  isVisitorBlockReason,
  VisitorBlockRecord,
  VisitorUnblockRecord,
} from './value-objects/visitor-block';

/**
 * Primitivos para la serialización del agregado VisitorV2
 */
export interface VisitorPrimitives {
  id: string;
  tenantId: string; // opcional pero práctico
  siteId: string;
  fingerprint: string;
  lifecycle: VisitorLifecycle; // ANON/ENGAGED/LEAD/CONVERTED
  connectionStatus?: ConnectionStatus; // online/away/chatting/offline (opcional para retrocompatibilidad)
  hasAcceptedPrivacyPolicy: boolean;
  privacyPolicyAcceptedAt: string | null;
  consentVersion: string | null;
  currentUrl?: string; // URL actual del visitante
  isInternal: boolean; // Marca si el visitante es un comercial/empleado
  /** Bloqueo de la empresa. No cambia el ciclo de vida. */
  block?: VisitorBlockRecord | null;
  /** Último desbloqueo, para no perder el rastro. */
  lastUnblock?: VisitorUnblockRecord | null;
  createdAt: string;
  updatedAt: string;
  sessions: ReturnType<Session['toPrimitives']>[];
}

/**
 * Agregado VisitorV2 siguiendo DDD
 * Representa un visitante en el sistema con su identificación única,
 * tenant, sitio asociado, huella digital, ciclo de vida y sesiones
 */
export class VisitorV2 extends AggregateRoot {
  private readonly id: VisitorId;
  private readonly tenantId: TenantId;
  private readonly siteId: SiteId;
  private readonly fingerprint: VisitorFingerprint;
  private lifecycle: VisitorLifecycleVO;
  private connectionStatus: ConnectionStatus;
  private hasAcceptedPrivacyPolicy: boolean;
  private privacyPolicyAcceptedAt: Date | null;
  private consentVersion: string | null;
  private currentUrl?: string;
  private isInternal: boolean;
  private block: VisitorBlockRecord | null;
  private lastUnblock: VisitorUnblockRecord | null;
  private readonly createdAt: Date;
  private updatedAt: Date;
  private sessions: Session[];

  private constructor(props: {
    id: VisitorId;
    tenantId: TenantId;
    siteId: SiteId;
    fingerprint: VisitorFingerprint;
    lifecycle: VisitorLifecycleVO;
    connectionStatus: ConnectionStatus;
    hasAcceptedPrivacyPolicy: boolean;
    privacyPolicyAcceptedAt: Date | null;
    consentVersion: string | null;
    currentUrl?: string;
    isInternal: boolean;
    block?: VisitorBlockRecord | null;
    lastUnblock?: VisitorUnblockRecord | null;
    createdAt: Date;
    updatedAt: Date;
    sessions: Session[];
  }) {
    super();
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.siteId = props.siteId;
    this.fingerprint = props.fingerprint;
    this.lifecycle = props.lifecycle;
    this.connectionStatus = props.connectionStatus;
    this.hasAcceptedPrivacyPolicy = props.hasAcceptedPrivacyPolicy;
    this.privacyPolicyAcceptedAt = props.privacyPolicyAcceptedAt;
    this.consentVersion = props.consentVersion;
    this.currentUrl = props.currentUrl;
    this.isInternal = props.isInternal;
    this.block = props.block ?? null;
    this.lastUnblock = props.lastUnblock ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.sessions = props.sessions;
  }

  /**
   * Método de fábrica para crear un nuevo visitante (emite evento)
   */
  public static create(props: {
    id: VisitorId;
    tenantId: TenantId;
    siteId: SiteId;
    fingerprint: VisitorFingerprint;
    lifecycle?: VisitorLifecycleVO;
    hasAcceptedPrivacyPolicy?: boolean;
    consentVersion?: string;
    isInternal?: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): VisitorV2 {
    const now = new Date();
    const lifecycle = props.lifecycle || VisitorLifecycleVO.anon();
    const initialSession = Session.create(
      SessionId.random(),
      props.ipAddress,
      props.userAgent,
    );
    const hasAccepted = props.hasAcceptedPrivacyPolicy || false;
    const isInternal = props.isInternal || false;

    const visitor = new VisitorV2({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      fingerprint: props.fingerprint,
      lifecycle,
      connectionStatus: ConnectionStatus.OFFLINE,
      hasAcceptedPrivacyPolicy: hasAccepted,
      privacyPolicyAcceptedAt: hasAccepted ? now : null,
      consentVersion: props.consentVersion || null,
      isInternal,
      createdAt: now,
      updatedAt: now,
      sessions: [initialSession],
    });

    // Emitir evento de creación
    visitor.apply(
      new VisitorCreatedEvent({
        id: props.id.getValue(),
        tenantId: props.tenantId.getValue(),
        siteId: props.siteId.getValue(),
        fingerprint: props.fingerprint.getValue(),
        lifecycle: lifecycle.getValue().toString(),
        createdAt: now.toISOString(),
      }),
    );

    return visitor;
  }

  /**
   * Método de fábrica para reconstruir desde primitivos (sin eventos)
   */
  public static fromPrimitives(primitives: VisitorPrimitives): VisitorV2 {
    return new VisitorV2({
      id: new VisitorId(primitives.id),
      tenantId: new TenantId(primitives.tenantId),
      siteId: new SiteId(primitives.siteId),
      fingerprint: new VisitorFingerprint(primitives.fingerprint),
      lifecycle: new VisitorLifecycleVO(primitives.lifecycle),
      connectionStatus: primitives.connectionStatus || ConnectionStatus.OFFLINE,
      hasAcceptedPrivacyPolicy: primitives.hasAcceptedPrivacyPolicy,
      privacyPolicyAcceptedAt: primitives.privacyPolicyAcceptedAt
        ? new Date(primitives.privacyPolicyAcceptedAt)
        : null,
      consentVersion: primitives.consentVersion,
      currentUrl: primitives.currentUrl,
      isInternal: primitives.isInternal || false,
      block: primitives.block ?? null,
      lastUnblock: primitives.lastUnblock ?? null,
      createdAt: new Date(primitives.createdAt),
      updatedAt: new Date(primitives.updatedAt),
      sessions: primitives.sessions.map((sessionPrimitives) =>
        Session.fromPrimitives(sessionPrimitives),
      ),
    });
  }

  /**
   * Convierte el agregado a primitivos para serialización
   */
  public toPrimitives(): VisitorPrimitives {
    return {
      id: this.id.getValue(),
      tenantId: this.tenantId.getValue(),
      siteId: this.siteId.getValue(),
      fingerprint: this.fingerprint.getValue(),
      lifecycle: this.lifecycle.getValue(),
      connectionStatus: this.connectionStatus,
      hasAcceptedPrivacyPolicy: this.hasAcceptedPrivacyPolicy,
      privacyPolicyAcceptedAt: this.privacyPolicyAcceptedAt
        ? this.privacyPolicyAcceptedAt.toISOString()
        : null,
      consentVersion: this.consentVersion,
      currentUrl: this.currentUrl,
      isInternal: this.isInternal,
      block: this.block,
      lastUnblock: this.lastUnblock,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      sessions: this.sessions.map((session) => session.toPrimitives()),
    };
  }

  /**
   * Cambia el ciclo de vida del visitante
   */
  public changeLifecycle(newLifecycle: VisitorLifecycle): void {
    const previousLifecycle = this.lifecycle;
    if (!previousLifecycle.canTransitionTo(newLifecycle)) {
      throw new Error(
        `Transición inválida de ${previousLifecycle.getValue()} a ${newLifecycle}`,
      );
    }

    this.lifecycle = new VisitorLifecycleVO(newLifecycle);
    this.updatedAt = new Date();

    // Emitir evento de cambio de ciclo de vida
    this.apply(
      new VisitorLifecycleChangedEvent({
        id: this.id.getValue(),
        previousLifecycle: previousLifecycle.getValue().toString(),
        newLifecycle: newLifecycle.toString(),
        changedAt: this.updatedAt.toISOString(),
      }),
    );
  }

  /**
   * Marca el visitante como comprometido/engaged
   */
  public markAsEngaged(): void {
    if (this.lifecycle.isAnon()) {
      this.changeLifecycle(VisitorLifecycle.ENGAGED);
    }
  }

  /**
   * Convierte el visitante en lead
   */
  public convertToLead(): void {
    if (this.lifecycle.isAnon() || this.lifecycle.isEngaged()) {
      this.changeLifecycle(VisitorLifecycle.LEAD);
    }
  }

  /**
   * Marca el visitante como convertido
   */
  public markAsConverted(): void {
    if (this.lifecycle.isEngaged() || this.lifecycle.isLead()) {
      this.changeLifecycle(VisitorLifecycle.CONVERTED);
    }
  }

  /**
   * Inicia una nueva sesión para el visitante
   */
  public startNewSession(ipAddress?: string, userAgent?: string): void {
    const newSession = Session.create(SessionId.random(), ipAddress, userAgent);
    this.sessions.push(newSession);
    this.updatedAt = new Date();

    // Emitir evento de sesión iniciada
    this.apply(
      new SessionStartedEvent({
        visitorId: this.id.getValue(),
        sessionId: newSession.getId().getValue(),
        startedAt: newSession.getStartedAt().toISOString(),
      }),
    );
  }

  /**
   * Finaliza la sesión activa actual
   */
  public endCurrentSession(): void {
    const activeSession = this.sessions.find((session) => session.isActive());
    if (activeSession) {
      const duration = activeSession.getDuration();
      activeSession.end();
      this.updatedAt = new Date();

      // Emitir evento de sesión finalizada
      this.apply(
        new SessionEndedEvent({
          visitorId: this.id.getValue(),
          sessionId: activeSession.getId().getValue(),
          endedAt: activeSession.getEndedAt()!.toISOString(),
          duration,
        }),
      );
    }
  }

  /**
   * Finaliza una sesión específica por su ID
   */
  public endSession(sessionId: SessionId): void {
    const session = this.sessions.find(
      (s) => s.getId().getValue() === sessionId.getValue(),
    );
    if (session && session.isActive()) {
      const duration = session.getDuration();
      session.end();
      this.updatedAt = new Date();

      // Emitir evento de sesión finalizada
      this.apply(
        new SessionEndedEvent({
          visitorId: this.id.getValue(),
          sessionId: session.getId().getValue(),
          endedAt: session.getEndedAt()!.toISOString(),
          duration,
        }),
      );
    }
  }

  /**
   * Finaliza todas las sesiones activas que cumplan con un predicado
   */
  public endSessionsWhere(predicate: (session: Session) => boolean): void {
    const sessionsToEnd = this.sessions.filter(
      (session) => session.isActive() && predicate(session),
    );

    sessionsToEnd.forEach((session) => {
      const duration = session.getDuration();
      session.end();
      this.updatedAt = new Date();

      // Emitir evento de sesión finalizada
      this.apply(
        new SessionEndedEvent({
          visitorId: this.id.getValue(),
          sessionId: session.getId().getValue(),
          endedAt: session.getEndedAt()!.toISOString(),
          duration,
        }),
      );
    });
  }

  /**
   * Actualiza la actividad de la sesión actual
   */
  public updateSessionActivity(): void {
    const activeSession = this.sessions.find((session) => session.isActive());
    if (activeSession) {
      activeSession.updateLastActivity();
      this.updatedAt = new Date();
    }
  }

  // Getters para acceso de solo lectura
  public getId(): VisitorId {
    return this.id;
  }

  public getTenantId(): TenantId {
    return this.tenantId;
  }

  public getSiteId(): SiteId {
    return this.siteId;
  }

  public getFingerprint(): VisitorFingerprint {
    return this.fingerprint;
  }

  public getLifecycle(): VisitorLifecycleVO {
    return this.lifecycle;
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getUpdatedAt(): Date {
    return this.updatedAt;
  }

  public getSessions(): Session[] {
    return [...this.sessions]; // Devolver copia para inmutabilidad
  }

  public getActiveSessions(): Session[] {
    return this.sessions.filter((session) => session.isActive());
  }

  public hasActiveSessions(): boolean {
    return this.sessions.some((session) => session.isActive());
  }

  /**
   * Verifica si el visitante está en estado anónimo
   */
  public isAnon(): boolean {
    return this.lifecycle.isAnon();
  }

  /**
   * Verifica si el visitante está comprometido/engaged
   */
  public isEngaged(): boolean {
    return this.lifecycle.isEngaged();
  }

  /**
   * Verifica si el visitante es un lead
   */
  public isLead(): boolean {
    return this.lifecycle.isLead();
  }

  /**
   * Verifica si el visitante está convertido
   */
  public isConverted(): boolean {
    return this.lifecycle.isConverted();
  }

  // ========== MÉTODOS DE GESTIÓN DE CONEXIÓN ==========
  // Estos métodos emiten eventos que serán manejados por la infraestructura para sincronizar con Redis

  /**
   * Marca el visitante como online (conectado)
   * Emite evento para que la infraestructura sincronice con Redis
   */
  public goOnline(): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = ConnectionStatus.ONLINE;
    this.updatedAt = new Date();

    this.apply(
      new VisitorConnectionChangedEvent({
        visitorId: this.id.getValue(),
        previousConnection: previousStatus,
        newConnection: ConnectionStatus.ONLINE,
        timestamp: this.updatedAt.toISOString(),
      }),
    );
  }

  /**
   * Marca el visitante como activo en chat
   * Emite evento para que la infraestructura sincronice con Redis
   */
  public startChatting(): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = ConnectionStatus.CHATTING;
    this.updatedAt = new Date();

    this.apply(
      new VisitorConnectionChangedEvent({
        visitorId: this.id.getValue(),
        previousConnection: previousStatus,
        newConnection: ConnectionStatus.CHATTING,
        timestamp: this.updatedAt.toISOString(),
      }),
    );
  }

  /**
   * Marca el visitante como desconectado
   * Emite evento para que la infraestructura sincronice con Redis
   */
  public goOffline(): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = ConnectionStatus.OFFLINE;
    this.updatedAt = new Date();

    this.apply(
      new VisitorConnectionChangedEvent({
        visitorId: this.id.getValue(),
        previousConnection: previousStatus,
        newConnection: ConnectionStatus.OFFLINE,
        timestamp: this.updatedAt.toISOString(),
      }),
    );
  }

  /**
   * Marca el visitante como ausente (away)
   * Emite evento para que la infraestructura sincronice con Redis
   */
  public goAway(): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = ConnectionStatus.AWAY;
    this.updatedAt = new Date();

    this.apply(
      new VisitorConnectionChangedEvent({
        visitorId: this.id.getValue(),
        previousConnection: previousStatus,
        newConnection: ConnectionStatus.AWAY,
        timestamp: this.updatedAt.toISOString(),
      }),
    );
  }

  /**
   * Detiene el chat activo y retorna a online
   * Emite evento para que la infraestructura sincronice con Redis
   */
  public stopChatting(): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = ConnectionStatus.ONLINE;
    this.updatedAt = new Date();

    this.apply(
      new VisitorConnectionChangedEvent({
        visitorId: this.id.getValue(),
        previousConnection: previousStatus,
        newConnection: ConnectionStatus.ONLINE,
        timestamp: this.updatedAt.toISOString(),
      }),
    );
  }

  /**
   * Retorna de away a online
   * Emite evento para que la infraestructura sincronice con Redis
   */
  public returnFromAway(): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = ConnectionStatus.ONLINE;
    this.updatedAt = new Date();

    this.apply(
      new VisitorConnectionChangedEvent({
        visitorId: this.id.getValue(),
        previousConnection: previousStatus,
        newConnection: ConnectionStatus.ONLINE,
        timestamp: this.updatedAt.toISOString(),
      }),
    );
  }

  /**
   * Registra la aceptación de la política de privacidad
   * RGPD Art. 7.1: Capacidad de demostrar el consentimiento
   */
  public acceptPrivacyPolicy(version: string): void {
    this.hasAcceptedPrivacyPolicy = true;
    this.privacyPolicyAcceptedAt = new Date();
    this.consentVersion = version;
    this.updatedAt = new Date();
  }

  /**
   * Verifica si el visitante ha aceptado la política de privacidad
   */
  public hasValidConsent(): boolean {
    return this.hasAcceptedPrivacyPolicy;
  }

  // Getters para los nuevos campos
  public getHasAcceptedPrivacyPolicy(): boolean {
    return this.hasAcceptedPrivacyPolicy;
  }

  public getPrivacyPolicyAcceptedAt(): Date | null {
    return this.privacyPolicyAcceptedAt;
  }

  public getConsentVersion(): string | null {
    return this.consentVersion;
  }

  public getCurrentUrl(): string | undefined {
    return this.currentUrl;
  }

  public getIsInternal(): boolean {
    return this.isInternal;
  }

  /**
   * Marca el visitante como interno (comercial/empleado)
   * Retorna una nueva instancia con isInternal: true manteniendo inmutabilidad
   */
  public markAsInternal(): VisitorV2 {
    if (this.isInternal) {
      // Ya es interno, no hacer nada
      return this;
    }

    // Crear nueva instancia con isInternal = true
    const primitives = this.toPrimitives();
    primitives.isInternal = true;
    primitives.updatedAt = new Date().toISOString();

    return VisitorV2.fromPrimitives(primitives);
  }

  public isBlocked(): boolean {
    return this.block !== null;
  }

  public getBlock(): VisitorBlockRecord | null {
    return this.block;
  }

  /**
   * Bloquea al visitante para toda la empresa. El ciclo de vida no cambia.
   */
  public blockVisitor(input: {
    blockedBy: string;
    blockedByName: string;
    reason: string;
    note?: string;
  }): void {
    if (this.block) {
      throw new Error('El visitante ya está bloqueado');
    }
    if (!isVisitorBlockReason(input.reason)) {
      throw new Error('El motivo de bloqueo no es válido');
    }
    const note = input.note?.trim();
    if (input.reason === 'other' && !note) {
      throw new Error('El motivo «Otro» necesita una nota');
    }

    const blockedAt = new Date();
    this.block = {
      blockedAt: blockedAt.toISOString(),
      blockedBy: input.blockedBy,
      blockedByName: input.blockedByName.trim() || 'Comercial',
      reason: input.reason,
      ...(note ? { note } : {}),
    };
    this.updatedAt = blockedAt;
    this.apply(
      new VisitorBlockedEvent({
        visitorId: this.id.getValue(),
        tenantId: this.tenantId.getValue(),
        blockedAt: this.block.blockedAt,
        blockedBy: this.block.blockedBy,
        blockedByName: this.block.blockedByName,
        reason: this.block.reason,
        note: this.block.note,
      }),
    );
  }

  /**
   * Levanta el bloqueo y guarda quién lo hizo. No reabre chats.
   */
  public unblockVisitor(input: {
    unblockedBy: string;
    unblockedByName: string;
  }): void {
    if (!this.block) {
      throw new Error('El visitante no está bloqueado');
    }
    const now = new Date();
    this.lastUnblock = {
      unblockedAt: now.toISOString(),
      unblockedBy: input.unblockedBy,
      unblockedByName: input.unblockedByName.trim() || 'Comercial',
    };
    this.block = null;
    this.updatedAt = now;
    this.apply(
      new VisitorUnblockedEvent({
        visitorId: this.id.getValue(),
        tenantId: this.tenantId.getValue(),
        unblockedAt: this.lastUnblock.unblockedAt,
        unblockedBy: this.lastUnblock.unblockedBy,
        unblockedByName: this.lastUnblock.unblockedByName,
      }),
    );
  }

  /**
   * Actualiza la URL actual del visitante y de la sesión activa
   */
  public updateCurrentUrl(url: string): void {
    const previousPage = this.currentUrl || null;

    // Solo emitir evento si la URL realmente cambió
    if (previousPage === url) {
      return;
    }

    this.currentUrl = url;
    this.updatedAt = new Date();

    // Actualizar también la sesión activa
    const activeSession = this.sessions.find((session) => session.isActive());
    if (activeSession) {
      activeSession.updateCurrentUrl(url);
    }

    // Emitir evento de cambio de página
    this.apply(
      new VisitorCurrentPageChangedEvent({
        visitorId: this.id.getValue(),
        tenantId: this.tenantId.getValue(),
        siteId: this.siteId.getValue(),
        previousPage,
        currentPage: url,
        timestamp: this.updatedAt.toISOString(),
      }),
    );
  }
}
