# Ejemplos de Integración - Sistema de Consentimientos RGPD

Esta guía proporciona ejemplos completos y prácticos para implementar el sistema de consentimientos RGPD en tu aplicación frontend.

## Índice

1. [Inicio Rápido](#inicio-rápido)
2. [Identificación del Visitante](#identificación-del-visitante)
3. [Widget de Consentimiento de Cookies](#widget-de-consentimiento-de-cookies)
4. [Panel de Preferencias de Usuario](#panel-de-preferencias-de-usuario)
5. [Sistema de Notificaciones de Expiración](#sistema-de-notificaciones-de-expiración)
6. [Integración con React](#integración-con-react)
7. [Integración con Vue.js](#integración-con-vuejs)
8. [Integración con Angular](#integración-con-angular)
9. [Integración con Servicios de Terceros](#integración-con-servicios-de-terceros)
10. [Mejores Prácticas](#mejores-prácticas)

---

## Inicio Rápido

### Flujo Completo de Implementación

```
1. Usuario visita tu sitio web
   ↓
2. Identificar visitante (POST /api/visitors/identify)
   ↓
3. Obtener token de autenticación del visitante
   ↓
4. Verificar consentimientos existentes (GET /api/consents/visitors/:visitorId)
   ↓
5. Si no hay consentimientos → Mostrar banner de cookies
   ↓
6. Usuario acepta/rechaza → Backend registra automáticamente
   ↓
7. Activar servicios según consentimientos otorgados
```

### Requisitos Previos

```bash
# Variables de entorno necesarias
VITE_API_URL=https://api.tudominio.com
VITE_API_KEY=tu-api-key-aqui
VITE_DOMAIN=tudominio.com
```

---

## Identificación del Visitante

**⚠️ IMPORTANTE**: Antes de gestionar consentimientos, debes identificar al visitante en el sistema.

### Paso 1: Identificar o Crear Visitante

```typescript
// services/visitor.service.ts
interface IdentifyVisitorPayload {
  domain: string;
  apiKey: string;
  email?: string;
  name?: string;
  phone?: string;
  hasAcceptedPrivacyPolicy: boolean; // ⚠️ OBLIGATORIO
  fingerprint?: string;
  currentUrl?: string;
  referrer?: string;
}

interface VisitorResponse {
  id: string;
  email?: string;
  name?: string;
  sessionToken: string;
  isNewVisitor: boolean;
}

export class VisitorService {
  private apiUrl: string;
  private apiKey: string;
  private domain: string;

  constructor(config: { apiUrl: string; apiKey: string; domain: string }) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.domain = config.domain;
  }

  /**
   * Identifica o crea un visitante en el sistema
   * IMPORTANTE: hasAcceptedPrivacyPolicy debe ser true antes de llamar
   */
  async identify(data: {
    email?: string;
    name?: string;
    phone?: string;
    hasAcceptedPrivacyPolicy: boolean;
  }): Promise<VisitorResponse> {
    const payload: IdentifyVisitorPayload = {
      domain: this.domain,
      apiKey: this.apiKey,
      hasAcceptedPrivacyPolicy: data.hasAcceptedPrivacyPolicy,
      email: data.email,
      name: data.name,
      phone: data.phone,
      fingerprint: await this.generateFingerprint(),
      currentUrl: window.location.href,
      referrer: document.referrer || undefined,
    };

    const response = await fetch(`${this.apiUrl}/api/visitors/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error al identificar visitante');
    }

    return response.json();
  }

  /**
   * Genera un fingerprint único del navegador
   */
  private async generateFingerprint(): Promise<string> {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      navigator.platform,
    ];

    const str = components.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Guarda el token del visitante en localStorage
   */
  saveSession(visitorId: string, sessionToken: string): void {
    localStorage.setItem('visitor_id', visitorId);
    localStorage.setItem('visitor_token', sessionToken);
    localStorage.setItem('visitor_session_timestamp', Date.now().toString());
  }

  /**
   * Obtiene la sesión guardada del visitante
   */
  getSession(): { visitorId: string; token: string } | null {
    const visitorId = localStorage.getItem('visitor_id');
    const token = localStorage.getItem('visitor_token');

    if (!visitorId || !token) return null;

    // Verificar si la sesión ha expirado (ejemplo: 30 días)
    const timestamp = localStorage.getItem('visitor_session_timestamp');
    if (timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 días
      if (age > maxAge) {
        this.clearSession();
        return null;
      }
    }

    return { visitorId, token };
  }

  /**
   * Limpia la sesión del visitante
   */
  clearSession(): void {
    localStorage.removeItem('visitor_id');
    localStorage.removeItem('visitor_token');
    localStorage.removeItem('visitor_session_timestamp');
  }
}
```

### Paso 2: Implementar Flujo de Consentimiento Inicial

```typescript
// consent-manager.ts
import { VisitorService } from './visitor.service';
import { ConsentService } from './consent.service';

export class ConsentManager {
  private visitorService: VisitorService;
  private consentService: ConsentService;

  constructor(config: { apiUrl: string; apiKey: string; domain: string }) {
    this.visitorService = new VisitorService(config);
    this.consentService = new ConsentService(config.apiUrl);
  }

  /**
   * Inicializa el sistema de consentimientos
   * Debe llamarse al cargar la página
   */
  async initialize(): Promise<void> {
    // 1. Verificar si ya existe sesión
    const session = this.visitorService.getSession();

    if (session) {
      // Ya existe sesión, verificar consentimientos
      await this.checkExistingConsents(session.visitorId, session.token);
    } else {
      // No hay sesión, mostrar banner inicial
      this.showInitialConsentBanner();
    }
  }

  /**
   * Muestra el banner inicial de consentimiento
   * El usuario debe aceptar la política de privacidad primero
   */
  private showInitialConsentBanner(): void {
    const banner = document.createElement('div');
    banner.className = 'initial-consent-banner';
    banner.innerHTML = `
      <div class="banner-content">
        <h3>🍪 Bienvenido a nuestro sitio</h3>
        <p>
          Utilizamos cookies y tecnologías similares para mejorar tu experiencia.
          Al continuar navegando, aceptas nuestra
          <a href="/privacy-policy" target="_blank">Política de Privacidad</a>.
        </p>
        <div class="banner-actions">
          <button id="accept-privacy" class="btn btn-primary">
            Aceptar y Continuar
          </button>
          <button id="customize-consent" class="btn btn-secondary">
            Personalizar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Aceptar política de privacidad (obligatorio)
    document.getElementById('accept-privacy')?.addEventListener('click', async () => {
      await this.handlePrivacyAcceptance(true, true, true);
      banner.remove();
    });

    // Personalizar consentimientos
    document.getElementById('customize-consent')?.addEventListener('click', async () => {
      banner.remove();
      this.showCustomizationModal();
    });
  }

  /**
   * Maneja la aceptación de la política de privacidad
   * y registra al visitante con sus preferencias
   */
  private async handlePrivacyAcceptance(
    acceptPrivacy: boolean,
    acceptMarketing: boolean,
    acceptAnalytics: boolean
  ): Promise<void> {
    try {
      // 1. Identificar visitante (esto registra automáticamente el consentimiento de privacidad)
      const visitor = await this.visitorService.identify({
        hasAcceptedPrivacyPolicy: acceptPrivacy,
      });

      // 2. Guardar sesión
      this.visitorService.saveSession(visitor.id, visitor.sessionToken);

      // 3. Activar servicios según consentimientos
      if (acceptAnalytics) {
        this.enableAnalytics();
      }
      if (acceptMarketing) {
        this.enableMarketing();
      }

      console.log('✅ Visitante identificado:', visitor.id);
    } catch (error) {
      console.error('❌ Error al registrar consentimiento:', error);
      alert('Error al procesar tu consentimiento. Por favor, intenta nuevamente.');
    }
  }

  /**
   * Muestra modal de personalización de consentimientos
   */
  private showCustomizationModal(): void {
    const modal = document.createElement('div');
    modal.className = 'consent-customization-modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <h2>Personaliza tus Preferencias</h2>
        <p>Elige qué cookies y servicios quieres permitir:</p>

        <div class="consent-option">
          <div class="option-header">
            <div>
              <h3>🔒 Cookies Esenciales</h3>
              <p>Necesarias para el funcionamiento del sitio. No se pueden desactivar.</p>
            </div>
            <label class="toggle disabled">
              <input type="checkbox" id="privacy-toggle" checked disabled>
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="consent-option">
          <div class="option-header">
            <div>
              <h3>📊 Cookies de Análisis</h3>
              <p>Nos ayudan a entender cómo usas el sitio para mejorarlo.</p>
            </div>
            <label class="toggle">
              <input type="checkbox" id="analytics-toggle" checked>
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="consent-option">
          <div class="option-header">
            <div>
              <h3>🎯 Cookies de Marketing</h3>
              <p>Permiten mostrar anuncios relevantes a tus intereses.</p>
            </div>
            <label class="toggle">
              <input type="checkbox" id="marketing-toggle" checked>
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button id="save-custom-preferences" class="btn btn-primary">
            Guardar Preferencias
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('save-custom-preferences')?.addEventListener('click', async () => {
      const analytics = (document.getElementById('analytics-toggle') as HTMLInputElement).checked;
      const marketing = (document.getElementById('marketing-toggle') as HTMLInputElement).checked;

      await this.handlePrivacyAcceptance(true, marketing, analytics);
      modal.remove();
    });
  }

  /**
   * Verifica consentimientos existentes de un visitante identificado
   */
  private async checkExistingConsents(visitorId: string, token: string): Promise<void> {
    try {
      const consents = await this.consentService.getVisitorConsents(visitorId, token);

      // Verificar si tiene consentimiento de privacidad activo
      const privacyConsent = consents.find(
        c => c.consentType === 'privacy_policy' && c.status === 'granted'
      );

      if (!privacyConsent) {
        // No tiene consentimiento activo, mostrar banner
        this.showInitialConsentBanner();
        return;
      }

      // Activar servicios según consentimientos existentes
      consents.forEach(consent => {
        if (consent.status === 'granted') {
          if (consent.consentType === 'analytics') {
            this.enableAnalytics();
          } else if (consent.consentType === 'marketing') {
            this.enableMarketing();
          }
        }
      });

      // Verificar consentimientos próximos a expirar
      const expiring = this.consentService.findExpiringConsents(consents, 30);
      if (expiring.length > 0) {
        this.showExpirationWarning(expiring);
      }
    } catch (error) {
      console.error('Error al verificar consentimientos:', error);
    }
  }

  private enableAnalytics(): void {
    console.log('📊 Analytics habilitado');
    // Aquí activarías Google Analytics, Mixpanel, etc.
  }

  private enableMarketing(): void {
    console.log('🎯 Marketing habilitado');
    // Aquí activarías píxeles de Facebook, Google Ads, etc.
  }

  private showExpirationWarning(expiringConsents: any[]): void {
    // Implementar notificación de expiración
    console.log('⚠️ Consentimientos próximos a expirar:', expiringConsents);
  }
}

// Uso en tu aplicación
document.addEventListener('DOMContentLoaded', async () => {
  const manager = new ConsentManager({
    apiUrl: import.meta.env.VITE_API_URL,
    apiKey: import.meta.env.VITE_API_KEY,
    domain: import.meta.env.VITE_DOMAIN,
  });

  await manager.initialize();
});
```

### Servicio de Consentimientos

```typescript
// consent.service.ts
export interface Consent {
  id: string;
  visitorId: string;
  consentType: 'privacy_policy' | 'marketing' | 'analytics';
  status: 'granted' | 'revoked' | 'expired';
  version: string;
  grantedAt: string;
  revokedAt?: string;
  expiresAt?: string;
  ipAddress: string;
  userAgent?: string;
}

export class ConsentService {
  constructor(private apiUrl: string) {}

  /**
   * Obtiene todos los consentimientos de un visitante
   */
  async getVisitorConsents(visitorId: string, token: string): Promise<Consent[]> {
    const response = await fetch(
      `${this.apiUrl}/api/consents/visitors/${visitorId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Error al obtener consentimientos');
    }

    const data = await response.json();
    return data.consents || [];
  }

  /**
   * Revoca un consentimiento
   */
  async revokeConsent(
    visitorId: string,
    consentType: string,
    reason: string,
    token: string
  ): Promise<void> {
    const response = await fetch(`${this.apiUrl}/api/consents/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ visitorId, consentType, reason }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error al revocar consentimiento');
    }
  }

  /**
   * Renueva un consentimiento
   */
  async renewConsent(
    visitorId: string,
    consentType: string,
    newExpiresAt: string,
    token: string
  ): Promise<void> {
    const response = await fetch(`${this.apiUrl}/api/consents/renew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ visitorId, consentType, newExpiresAt }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error al renovar consentimiento');
    }
  }

  /**
   * Encuentra consentimientos próximos a expirar
   */
  findExpiringConsents(consents: Consent[], daysThreshold: number): Consent[] {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysThreshold);

    return consents.filter(consent => {
      if (!consent.expiresAt || consent.status !== 'granted') return false;
      const expiresAt = new Date(consent.expiresAt);
      return expiresAt > now && expiresAt <= futureDate;
    });
  }

  /**
   * Verifica si un tipo de consentimiento está activo
   */
  hasActiveConsent(consents: Consent[], consentType: string): boolean {
    const now = new Date();
    return consents.some(
      c =>
        c.consentType === consentType &&
        c.status === 'granted' &&
        (!c.expiresAt || new Date(c.expiresAt) > now)
    );
  }
}
```

---

## Widget de Consentimiento de Cookies

### Implementación Básica

```typescript
// consent-widget.ts
export class ConsentWidget {
  private visitorId: string;
  private apiUrl: string;
  private token: string;

  constructor(config: { visitorId: string; apiUrl: string; token: string }) {
    this.visitorId = config.visitorId;
    this.apiUrl = config.apiUrl;
    this.token = config.token;
  }

  async initialize() {
    // Verificar si ya tiene consentimientos activos
    const status = await this.checkConsentStatus();

    if (!status.hasPrivacyPolicy) {
      // Mostrar banner de consentimiento
      this.showConsentBanner();
    }

    // Verificar si hay consentimientos próximos a expirar
    const expiring = await this.checkExpiringConsents();
    if (expiring.length > 0) {
      this.showExpirationWarning(expiring);
    }
  }

  private async checkConsentStatus() {
    const response = await fetch(
      `${this.apiUrl}/consents/visitors/${this.visitorId}`,
      {
        headers: { 'Authorization': `Bearer ${this.token}` }
      }
    );

    const data = await response.json();
    const now = new Date();

    return {
      hasPrivacyPolicy: data.consents.some(
        c => c.consentType === 'privacy_policy' &&
             c.status === 'granted' &&
             (!c.expiresAt || new Date(c.expiresAt) > now)
      ),
      hasMarketing: data.consents.some(
        c => c.consentType === 'marketing' &&
             c.status === 'granted' &&
             (!c.expiresAt || new Date(c.expiresAt) > now)
      ),
      hasAnalytics: data.consents.some(
        c => c.consentType === 'analytics' &&
             c.status === 'granted' &&
             (!c.expiresAt || new Date(c.expiresAt) > now)
      )
    };
  }

  private showConsentBanner() {
    const banner = document.createElement('div');
    banner.className = 'consent-banner';
    banner.innerHTML = `
      <div class="consent-banner__content">
        <h3>Utilizamos cookies</h3>
        <p>
          Utilizamos cookies y tecnologías similares para mejorar tu experiencia.
          Puedes configurar tus preferencias en cualquier momento.
        </p>
        <div class="consent-banner__actions">
          <button id="accept-all" class="btn btn-primary">
            Aceptar todas
          </button>
          <button id="customize" class="btn btn-secondary">
            Personalizar
          </button>
          <button id="reject-all" class="btn btn-text">
            Rechazar todas
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Event listeners
    document.getElementById('accept-all')?.addEventListener('click', () => {
      this.handleAcceptAll();
      banner.remove();
    });

    document.getElementById('customize')?.addEventListener('click', () => {
      this.showCustomizeModal();
      banner.remove();
    });

    document.getElementById('reject-all')?.addEventListener('click', () => {
      this.handleRejectAll();
      banner.remove();
    });
  }

  private async handleAcceptAll() {
    // Nota: En un caso real, necesitarías un endpoint para registrar consentimientos
    // Por ahora asumimos que ya existen y solo mostramos el flujo
    console.log('Todos los consentimientos aceptados');

    // Habilitar analytics, marketing, etc.
    this.enableAnalytics();
    this.enableMarketing();
  }

  private showCustomizeModal() {
    const modal = document.createElement('div');
    modal.className = 'consent-modal';
    modal.innerHTML = `
      <div class="consent-modal__overlay"></div>
      <div class="consent-modal__content">
        <h2>Personaliza tus preferencias</h2>

        <div class="consent-option">
          <div class="consent-option__header">
            <h3>Cookies Esenciales</h3>
            <label class="toggle disabled">
              <input type="checkbox" checked disabled>
              <span class="toggle__slider"></span>
            </label>
          </div>
          <p>Necesarias para el funcionamiento básico del sitio. No se pueden desactivar.</p>
        </div>

        <div class="consent-option">
          <div class="consent-option__header">
            <h3>Cookies de Marketing</h3>
            <label class="toggle">
              <input type="checkbox" id="marketing-toggle">
              <span class="toggle__slider"></span>
            </label>
          </div>
          <p>Permiten mostrar anuncios relevantes y medir la efectividad de campañas.</p>
        </div>

        <div class="consent-option">
          <div class="consent-option__header">
            <h3>Cookies de Análisis</h3>
            <label class="toggle">
              <input type="checkbox" id="analytics-toggle">
              <span class="toggle__slider"></span>
            </label>
          </div>
          <p>Ayudan a comprender cómo los visitantes interactúan con el sitio.</p>
        </div>

        <div class="consent-modal__actions">
          <button id="save-preferences" class="btn btn-primary">
            Guardar preferencias
          </button>
          <button id="cancel" class="btn btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('save-preferences')?.addEventListener('click', async () => {
      const marketing = (document.getElementById('marketing-toggle') as HTMLInputElement).checked;
      const analytics = (document.getElementById('analytics-toggle') as HTMLInputElement).checked;

      await this.savePreferences({ marketing, analytics });
      modal.remove();
    });

    document.getElementById('cancel')?.addEventListener('click', () => {
      modal.remove();
    });
  }

  private async savePreferences(preferences: { marketing: boolean; analytics: boolean }) {
    const currentStatus = await this.checkConsentStatus();

    // Gestionar marketing
    if (preferences.marketing && !currentStatus.hasMarketing) {
      console.log('Activar marketing');
      // Aquí registrarías el consentimiento nuevo
    } else if (!preferences.marketing && currentStatus.hasMarketing) {
      await this.revokeConsent('marketing');
    }

    // Gestionar analytics
    if (preferences.analytics && !currentStatus.hasAnalytics) {
      console.log('Activar analytics');
      // Aquí registrarías el consentimiento nuevo
    } else if (!preferences.analytics && currentStatus.hasAnalytics) {
      await this.revokeConsent('analytics');
    }
  }

  private async revokeConsent(consentType: string) {
    await fetch(`${this.apiUrl}/consents/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        visitorId: this.visitorId,
        consentType,
        reason: 'Usuario desactivó desde preferencias'
      })
    });
  }

  private async checkExpiringConsents(days = 30) {
    const response = await fetch(
      `${this.apiUrl}/consents/visitors/${this.visitorId}`,
      {
        headers: { 'Authorization': `Bearer ${this.token}` }
      }
    );

    const data = await response.json();
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return data.consents.filter(consent => {
      if (!consent.expiresAt || consent.status !== 'granted') return false;
      const expiresAt = new Date(consent.expiresAt);
      return expiresAt > now && expiresAt <= futureDate;
    });
  }

  private showExpirationWarning(expiringConsents: any[]) {
    const warning = document.createElement('div');
    warning.className = 'consent-expiration-warning';
    warning.innerHTML = `
      <div class="warning-content">
        <span class="warning-icon">⚠️</span>
        <p>
          Algunos de tus consentimientos expirarán pronto.
          <a href="#" id="renew-consents">Renovar ahora</a>
        </p>
        <button id="dismiss-warning" class="btn-close">&times;</button>
      </div>
    `;

    document.body.appendChild(warning);

    document.getElementById('renew-consents')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showRenewalModal(expiringConsents);
      warning.remove();
    });

    document.getElementById('dismiss-warning')?.addEventListener('click', () => {
      warning.remove();
    });
  }

  private showRenewalModal(consents: any[]) {
    const modal = document.createElement('div');
    modal.className = 'renewal-modal';

    const consentsList = consents.map(c => {
      const daysRemaining = Math.ceil(
        (new Date(c.expiresAt) - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      return `
        <div class="renewal-item">
          <h4>${this.formatConsentType(c.consentType)}</h4>
          <p>Expira en ${daysRemaining} días</p>
          <button class="btn btn-primary btn-sm" data-consent-type="${c.consentType}">
            Renovar
          </button>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="consent-modal__overlay"></div>
      <div class="consent-modal__content">
        <h2>Renovar Consentimientos</h2>
        <p>Los siguientes consentimientos están próximos a expirar:</p>
        <div class="renewal-list">
          ${consentsList}
        </div>
        <button id="close-renewal" class="btn btn-secondary">Cerrar</button>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-consent-type]').forEach(button => {
      button.addEventListener('click', async (e) => {
        const type = (e.target as HTMLElement).getAttribute('data-consent-type')!;
        await this.renewConsent(type);
        button.textContent = '✓ Renovado';
        (button as HTMLButtonElement).disabled = true;
      });
    });

    document.getElementById('close-renewal')?.addEventListener('click', () => {
      modal.remove();
    });
  }

  private async renewConsent(consentType: string) {
    const newExpiresAt = new Date();
    newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

    await fetch(`${this.apiUrl}/consents/renew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        visitorId: this.visitorId,
        consentType,
        newExpiresAt: newExpiresAt.toISOString()
      })
    });
  }

  private formatConsentType(type: string): string {
    const labels = {
      'privacy_policy': 'Política de Privacidad',
      'marketing': 'Comunicaciones de Marketing',
      'analytics': 'Análisis y Estadísticas'
    };
    return labels[type] || type;
  }

  private enableAnalytics() {
    // Activar Google Analytics, etc.
    console.log('Analytics enabled');
  }

  private enableMarketing() {
    // Activar píxeles de marketing, etc.
    console.log('Marketing enabled');
  }

  private async handleRejectAll() {
    const status = await this.checkConsentStatus();

    // Revocar todos los consentimientos opcionales
    if (status.hasMarketing) {
      await this.revokeConsent('marketing');
    }
    if (status.hasAnalytics) {
      await this.revokeConsent('analytics');
    }

    console.log('Todos los consentimientos opcionales revocados');
  }
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  const widget = new ConsentWidget({
    visitorId: 'visitor-uuid-here',
    apiUrl: 'https://api.tudominio.com',
    token: 'visitor-token-here'
  });

  widget.initialize();
});
```

### CSS para el Widget

```css
/* consent-widget.css */
.consent-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.1);
  padding: 20px;
  z-index: 9999;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.consent-banner__content {
  max-width: 1200px;
  margin: 0 auto;
}

.consent-banner__content h3 {
  margin: 0 0 10px 0;
  font-size: 20px;
}

.consent-banner__content p {
  margin: 0 0 20px 0;
  color: #666;
}

.consent-banner__actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-primary {
  background: #0066ff;
  color: white;
}

.btn-primary:hover {
  background: #0052cc;
}

.btn-secondary {
  background: #f0f0f0;
  color: #333;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.btn-text {
  background: transparent;
  color: #666;
}

.consent-modal__overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 10000;
}

.consent-modal__content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  z-index: 10001;
}

.consent-option {
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  margin-bottom: 15px;
}

.consent-option__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.toggle {
  position: relative;
  width: 50px;
  height: 24px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle__slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
  border-radius: 24px;
}

.toggle__slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

.toggle input:checked + .toggle__slider {
  background-color: #0066ff;
}

.toggle input:checked + .toggle__slider:before {
  transform: translateX(26px);
}

.toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.consent-expiration-warning {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 15px;
  max-width: 400px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 9998;
}

.warning-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.warning-icon {
  font-size: 24px;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  margin-left: auto;
}
```

---

## Panel de Preferencias de Usuario

### Implementación Completa con React

```typescript
// ConsentPreferencesPanel.tsx
import React, { useState, useEffect } from 'react';

interface Consent {
  id: string;
  consentType: string;
  status: string;
  version: string;
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

interface ConsentPreferencesPanelProps {
  visitorId: string;
  apiUrl: string;
  token: string;
}

export const ConsentPreferencesPanel: React.FC<ConsentPreferencesPanelProps> = ({
  visitorId,
  apiUrl,
  token
}) => {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConsents();
  }, [visitorId]);

  const loadConsents = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${apiUrl}/consents/visitors/${visitorId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        throw new Error('Error al cargar consentimientos');
      }

      const data = await response.json();
      setConsents(data.consents);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (consentType: string) => {
    if (!confirm('¿Estás seguro de que quieres revocar este consentimiento?')) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/consents/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          visitorId,
          consentType,
          reason: 'Revocado desde panel de preferencias'
        })
      });

      if (!response.ok) {
        throw new Error('Error al revocar consentimiento');
      }

      // Recargar consents
      await loadConsents();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRenew = async (consentType: string) => {
    const newExpiresAt = new Date();
    newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

    try {
      const response = await fetch(`${apiUrl}/consents/renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          visitorId,
          consentType,
          newExpiresAt: newExpiresAt.toISOString()
        })
      });

      if (!response.ok) {
        throw new Error('Error al renovar consentimiento');
      }

      // Recargar consents
      await loadConsents();
    } catch (err) {
      alert(err.message);
    }
  };

  const getConsentStatus = (consent: Consent) => {
    if (consent.status === 'revoked') return 'Revocado';
    if (consent.status === 'expired') return 'Expirado';

    if (consent.expiresAt) {
      const daysRemaining = Math.ceil(
        (new Date(consent.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysRemaining < 0) return 'Expirado';
      if (daysRemaining < 30) return `Expira en ${daysRemaining} días`;
      return 'Activo';
    }

    return 'Activo';
  };

  const getStatusClass = (consent: Consent) => {
    if (consent.status === 'revoked' || consent.status === 'expired') {
      return 'status-danger';
    }

    if (consent.expiresAt) {
      const daysRemaining = Math.ceil(
        (new Date(consent.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysRemaining < 0) return 'status-danger';
      if (daysRemaining < 30) return 'status-warning';
    }

    return 'status-success';
  };

  if (loading) {
    return <div className="consent-panel__loading">Cargando...</div>;
  }

  if (error) {
    return <div className="consent-panel__error">Error: {error}</div>;
  }

  return (
    <div className="consent-preferences-panel">
      <h2>Mis Preferencias de Consentimiento</h2>
      <p className="subtitle">
        Gestiona tus consentimientos y preferencias de privacidad
      </p>

      <div className="consent-list">
        {consents.map(consent => (
          <div key={consent.id} className="consent-card">
            <div className="consent-card__header">
              <h3>{formatConsentType(consent.consentType)}</h3>
              <span className={`status-badge ${getStatusClass(consent)}`}>
                {getConsentStatus(consent)}
              </span>
            </div>

            <div className="consent-card__details">
              <p><strong>Versión:</strong> {consent.version}</p>
              <p><strong>Otorgado:</strong> {new Date(consent.grantedAt).toLocaleDateString('es-ES')}</p>
              {consent.expiresAt && (
                <p><strong>Expira:</strong> {new Date(consent.expiresAt).toLocaleDateString('es-ES')}</p>
              )}
              {consent.revokedAt && (
                <p><strong>Revocado:</strong> {new Date(consent.revokedAt).toLocaleDateString('es-ES')}</p>
              )}
            </div>

            <div className="consent-card__actions">
              {consent.status === 'granted' && (
                <>
                  <button
                    onClick={() => handleRenew(consent.consentType)}
                    className="btn btn-secondary"
                  >
                    Renovar
                  </button>
                  <button
                    onClick={() => handleRevoke(consent.consentType)}
                    className="btn btn-danger"
                  >
                    Revocar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatConsentType(type: string): string {
  const labels = {
    'privacy_policy': 'Política de Privacidad',
    'marketing': 'Comunicaciones de Marketing',
    'analytics': 'Análisis y Estadísticas'
  };
  return labels[type] || type;
}
```

---

## Sistema de Notificaciones de Expiración

```typescript
// consent-notifications.ts
export class ConsentNotificationSystem {
  private checkInterval = 24 * 60 * 60 * 1000; // 24 horas
  private intervalId: number | null = null;

  constructor(
    private visitorId: string,
    private apiUrl: string,
    private token: string
  ) {}

  start() {
    // Verificar inmediatamente
    this.checkExpiringConsents();

    // Luego verificar cada 24 horas
    this.intervalId = window.setInterval(
      () => this.checkExpiringConsents(),
      this.checkInterval
    );
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkExpiringConsents() {
    try {
      const response = await fetch(
        `${this.apiUrl}/consents/visitors/${this.visitorId}`,
        {
          headers: { 'Authorization': `Bearer ${this.token}` }
        }
      );

      const data = await response.json();
      const now = new Date();

      // Verificar consentimientos que expiran en 30, 15, 7 y 1 días
      [30, 15, 7, 1].forEach(days => {
        const threshold = new Date(now);
        threshold.setDate(threshold.getDate() + days);

        const expiring = data.consents.filter(consent => {
          if (!consent.expiresAt || consent.status !== 'granted') return false;

          const expiresAt = new Date(consent.expiresAt);
          const daysUntilExpiry = Math.ceil(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          return daysUntilExpiry === days;
        });

        if (expiring.length > 0) {
          this.sendNotification(expiring, days);
        }
      });
    } catch (error) {
      console.error('Error checking expiring consents:', error);
    }
  }

  private sendNotification(consents: any[], daysRemaining: number) {
    // Notification API del navegador
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Consentimientos próximos a expirar', {
        body: `${consents.length} consentimiento(s) expiran en ${daysRemaining} día(s)`,
        icon: '/path/to/icon.png',
        tag: `consent-expiry-${daysRemaining}`,
        requireInteraction: true
      });
    }

    // También enviar notificación in-app
    this.showInAppNotification(consents, daysRemaining);
  }

  private showInAppNotification(consents: any[], daysRemaining: number) {
    const notification = document.createElement('div');
    notification.className = 'in-app-notification';
    notification.innerHTML = `
      <div class="notification-content">
        <strong>Consentimientos próximos a expirar</strong>
        <p>${consents.length} consentimiento(s) expiran en ${daysRemaining} día(s)</p>
        <button class="btn-renew-all">Renovar todos</button>
      </div>
    `;

    document.body.appendChild(notification);

    notification.querySelector('.btn-renew-all')?.addEventListener('click', async () => {
      await this.renewAll(consents);
      notification.remove();
    });

    // Auto-ocultar después de 10 segundos
    setTimeout(() => notification.remove(), 10000);
  }

  private async renewAll(consents: any[]) {
    const newExpiresAt = new Date();
    newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

    for (const consent of consents) {
      try {
        await fetch(`${this.apiUrl}/consents/renew`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify({
            visitorId: this.visitorId,
            consentType: consent.consentType,
            newExpiresAt: newExpiresAt.toISOString()
          })
        });
      } catch (error) {
        console.error(`Error renovando ${consent.consentType}:`, error);
      }
    }
  }
}

// Uso
const notificationSystem = new ConsentNotificationSystem(
  'visitor-uuid',
  'https://api.tudominio.com',
  'visitor-token'
);

// Solicitar permiso para notificaciones
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// Iniciar sistema
notificationSystem.start();

// Detener cuando sea necesario
// notificationSystem.stop();
```

---

**Nota**: Estos ejemplos son ilustrativos. En una implementación real, deberías:

1. Agregar manejo de errores más robusto
2. Implementar retry logic para requests fallidos
3. Añadir tests unitarios y de integración
4. Considerar accesibilidad (ARIA labels, keyboard navigation)
5. Implementar internacionalización (i18n)
6. Optimizar para rendimiento (lazy loading, code splitting)
# Secciones Adicionales - Integración RGPD

## Integración con React

### Hook Personalizado useConsents

```typescript
// hooks/useConsents.ts
import { useState, useEffect, useCallback } from 'react';
import { ConsentService, Consent } from '../services/consent.service';
import { VisitorService } from '../services/visitor.service';

interface UseConsentsReturn {
  consents: Consent[];
  loading: boolean;
  error: string | null;
  hasActiveConsent: (type: string) => boolean;
  revokeConsent: (type: string, reason: string) => Promise<void>;
  renewConsent: (type: string, expiresAt: Date) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConsents(): UseConsentsReturn {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visitorService = new VisitorService({
    apiUrl: import.meta.env.VITE_API_URL,
    apiKey: import.meta.env.VITE_API_KEY,
    domain: import.meta.env.VITE_DOMAIN,
  });

  const consentService = new ConsentService(import.meta.env.VITE_API_URL);

  const loadConsents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const session = visitorService.getSession();
      if (!session) {
        throw new Error('No hay sesión de visitante activa');
      }

      const loadedConsents = await consentService.getVisitorConsents(
        session.visitorId,
        session.token
      );
      setConsents(loadedConsents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConsents();
  }, [loadConsents]);

  const hasActiveConsent = useCallback(
    (type: string) => {
      return consentService.hasActiveConsent(consents, type);
    },
    [consents]
  );

  const revokeConsent = useCallback(
    async (type: string, reason: string) => {
      const session = visitorService.getSession();
      if (!session) throw new Error('No hay sesión activa');

      await consentService.revokeConsent(
        session.visitorId,
        type,
        reason,
        session.token
      );
      await loadConsents();
    },
    [loadConsents]
  );

  const renewConsent = useCallback(
    async (type: string, expiresAt: Date) => {
      const session = visitorService.getSession();
      if (!session) throw new Error('No hay sesión activa');

      await consentService.renewConsent(
        session.visitorId,
        type,
        expiresAt.toISOString(),
        session.token
      );
      await loadConsents();
    },
    [loadConsents]
  );

  return {
    consents,
    loading,
    error,
    hasActiveConsent,
    revokeConsent,
    renewConsent,
    refresh: loadConsents,
  };
}
```

### Hook useConsentBanner

```typescript
// hooks/useConsentBanner.ts
import { useState, useEffect } from 'react';
import { VisitorService } from '../services/visitor.service';
import { ConsentService } from '../services/consent.service';

interface UseConsentBannerReturn {
  showBanner: boolean;
  acceptAll: () => Promise<void>;
  rejectAll: () => Promise<void>;
  customize: (preferences: {
    analytics: boolean;
    marketing: boolean;
  }) => Promise<void>;
}

export function useConsentBanner(): UseConsentBannerReturn {
  const [showBanner, setShowBanner] = useState(false);

  const visitorService = new VisitorService({
    apiUrl: import.meta.env.VITE_API_URL,
    apiKey: import.meta.env.VITE_API_KEY,
    domain: import.meta.env.VITE_DOMAIN,
  });

  const consentService = new ConsentService(import.meta.env.VITE_API_URL);

  useEffect(() => {
    checkConsentStatus();
  }, []);

  const checkConsentStatus = async () => {
    const session = visitorService.getSession();

    if (!session) {
      setShowBanner(true);
      return;
    }

    try {
      const consents = await consentService.getVisitorConsents(
        session.visitorId,
        session.token
      );

      const hasPrivacy = consentService.hasActiveConsent(
        consents,
        'privacy_policy'
      );

      setShowBanner(!hasPrivacy);
    } catch (error) {
      setShowBanner(true);
    }
  };

  const acceptAll = async () => {
    await visitorService.identify({
      hasAcceptedPrivacyPolicy: true,
    });
    setShowBanner(false);

    // Activar servicios
    if (typeof window.gtag !== 'undefined') {
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'granted',
      });
    }
  };

  const rejectAll = async () => {
    await visitorService.identify({
      hasAcceptedPrivacyPolicy: true,
    });
    setShowBanner(false);

    // Desactivar servicios opcionales
    if (typeof window.gtag !== 'undefined') {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
      });
    }
  };

  const customize = async (preferences: {
    analytics: boolean;
    marketing: boolean;
  }) => {
    await visitorService.identify({
      hasAcceptedPrivacyPolicy: true,
    });
    setShowBanner(false);

    // Configurar servicios según preferencias
    if (typeof window.gtag !== 'undefined') {
      window.gtag('consent', 'update', {
        analytics_storage: preferences.analytics ? 'granted' : 'denied',
        ad_storage: preferences.marketing ? 'granted' : 'denied',
      });
    }
  };

  return { showBanner, acceptAll, rejectAll, customize };
}
```

### Componente ConsentBanner Completo

```typescript
// components/ConsentBanner.tsx
import React, { useState } from 'react';
import { useConsentBanner } from '../hooks/useConsentBanner';
import './ConsentBanner.css';

export const ConsentBanner: React.FC = () => {
  const { showBanner, acceptAll, rejectAll, customize } = useConsentBanner();
  const [showCustomize, setShowCustomize] = useState(false);
  const [preferences, setPreferences] = useState({
    analytics: true,
    marketing: true,
  });

  if (!showBanner) return null;

  if (showCustomize) {
    return (
      <div className="consent-modal">
        <div className="consent-modal__overlay" />
        <div className="consent-modal__content">
          <h2>Personaliza tus Preferencias</h2>

          <div className="consent-option">
            <div className="option-info">
              <h3>🔒 Cookies Esenciales</h3>
              <p>Necesarias para el funcionamiento básico del sitio.</p>
            </div>
            <label className="toggle disabled">
              <input type="checkbox" checked disabled />
              <span className="slider" />
            </label>
          </div>

          <div className="consent-option">
            <div className="option-info">
              <h3>📊 Cookies de Análisis</h3>
              <p>Nos ayudan a mejorar tu experiencia.</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={preferences.analytics}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    analytics: e.target.checked,
                  }))
                }
              />
              <span className="slider" />
            </label>
          </div>

          <div className="consent-option">
            <div className="option-info">
              <h3>🎯 Cookies de Marketing</h3>
              <p>Permiten mostrar anuncios relevantes.</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={preferences.marketing}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    marketing: e.target.checked,
                  }))
                }
              />
              <span className="slider" />
            </label>
          </div>

          <div className="modal-actions">
            <button
              className="btn btn-primary"
              onClick={async () => {
                await customize(preferences);
                setShowCustomize(false);
              }}
            >
              Guardar Preferencias
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCustomize(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="consent-banner">
      <div className="consent-banner__content">
        <h3>🍪 Utilizamos cookies</h3>
        <p>
          Utilizamos cookies para mejorar tu experiencia. Puedes gestionar tus
          preferencias en cualquier momento.
        </p>
        <div className="consent-banner__actions">
          <button className="btn btn-primary" onClick={acceptAll}>
            Aceptar Todas
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowCustomize(true)}
          >
            Personalizar
          </button>
          <button className="btn btn-text" onClick={rejectAll}>
            Rechazar Todas
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## Integración con Vue.js

### Composable useConsents

```typescript
// composables/useConsents.ts
import { ref, computed, onMounted } from 'vue';
import { ConsentService, Consent } from '../services/consent.service';
import { VisitorService } from '../services/visitor.service';

export function useConsents() {
  const consents = ref<Consent[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const visitorService = new VisitorService({
    apiUrl: import.meta.env.VITE_API_URL,
    apiKey: import.meta.env.VITE_API_KEY,
    domain: import.meta.env.VITE_DOMAIN,
  });

  const consentService = new ConsentService(import.meta.env.VITE_API_URL);

  const hasActiveConsent = computed(() => {
    return (type: string) => {
      return consentService.hasActiveConsent(consents.value, type);
    };
  });

  const loadConsents = async () => {
    try {
      loading.value = true;
      error.value = null;

      const session = visitorService.getSession();
      if (!session) {
        throw new Error('No hay sesión de visitante activa');
      }

      consents.value = await consentService.getVisitorConsents(
        session.visitorId,
        session.token
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Error desconocido';
    } finally {
      loading.value = false;
    }
  };

  const revokeConsent = async (type: string, reason: string) => {
    const session = visitorService.getSession();
    if (!session) throw new Error('No hay sesión activa');

    await consentService.revokeConsent(
      session.visitorId,
      type,
      reason,
      session.token
    );
    await loadConsents();
  };

  const renewConsent = async (type: string, expiresAt: Date) => {
    const session = visitorService.getSession();
    if (!session) throw new Error('No hay sesión activa');

    await consentService.renewConsent(
      session.visitorId,
      type,
      expiresAt.toISOString(),
      session.token
    );
    await loadConsents();
  };

  onMounted(() => {
    loadConsents();
  });

  return {
    consents,
    loading,
    error,
    hasActiveConsent,
    revokeConsent,
    renewConsent,
    refresh: loadConsents,
  };
}
```

### Componente ConsentBanner.vue

```vue
<template>
  <div v-if="showBanner" class="consent-banner">
    <div class="consent-banner__content">
      <h3>🍪 Utilizamos cookies</h3>
      <p>
        Utilizamos cookies para mejorar tu experiencia. Puedes gestionar tus
        preferencias en cualquier momento.
      </p>
      <div class="consent-banner__actions">
        <button class="btn btn-primary" @click="acceptAll">
          Aceptar Todas
        </button>
        <button class="btn btn-secondary" @click="showCustomize = true">
          Personalizar
        </button>
        <button class="btn btn-text" @click="rejectAll">
          Rechazar Todas
        </button>
      </div>
    </div>

    <!-- Modal de personalización -->
    <teleport to="body">
      <div v-if="showCustomize" class="consent-modal">
        <div class="consent-modal__overlay" @click="showCustomize = false" />
        <div class="consent-modal__content">
          <h2>Personaliza tus Preferencias</h2>

          <div class="consent-option">
            <div class="option-info">
              <h3>🔒 Cookies Esenciales</h3>
              <p>Necesarias para el funcionamiento básico del sitio.</p>
            </div>
            <label class="toggle disabled">
              <input type="checkbox" checked disabled />
              <span class="slider" />
            </label>
          </div>

          <div class="consent-option">
            <div class="option-info">
              <h3>📊 Cookies de Análisis</h3>
              <p>Nos ayudan a mejorar tu experiencia.</p>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="preferences.analytics" />
              <span class="slider" />
            </label>
          </div>

          <div class="consent-option">
            <div class="option-info">
              <h3>🎯 Cookies de Marketing</h3>
              <p>Permiten mostrar anuncios relevantes.</p>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="preferences.marketing" />
              <span class="slider" />
            </label>
          </div>

          <div class="modal-actions">
            <button class="btn btn-primary" @click="savePreferences">
              Guardar Preferencias
            </button>
            <button class="btn btn-secondary" @click="showCustomize = false">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { VisitorService } from '../services/visitor.service';
import { ConsentService } from '../services/consent.service';

const showBanner = ref(false);
const showCustomize = ref(false);
const preferences = ref({
  analytics: true,
  marketing: true,
});

const visitorService = new VisitorService({
  apiUrl: import.meta.env.VITE_API_URL,
  apiKey: import.meta.env.VITE_API_KEY,
  domain: import.meta.env.VITE_DOMAIN,
});

const consentService = new ConsentService(import.meta.env.VITE_API_URL);

const checkConsentStatus = async () => {
  const session = visitorService.getSession();

  if (!session) {
    showBanner.value = true;
    return;
  }

  try {
    const consents = await consentService.getVisitorConsents(
      session.visitorId,
      session.token
    );

    const hasPrivacy = consentService.hasActiveConsent(consents, 'privacy_policy');
    showBanner.value = !hasPrivacy;
  } catch (error) {
    showBanner.value = true;
  }
};

const acceptAll = async () => {
  await visitorService.identify({ hasAcceptedPrivacyPolicy: true });
  showBanner.value = false;

  // Activar servicios
  if (typeof window.gtag !== 'undefined') {
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'granted',
    });
  }
};

const rejectAll = async () => {
  await visitorService.identify({ hasAcceptedPrivacyPolicy: true });
  showBanner.value = false;

  // Desactivar servicios opcionales
  if (typeof window.gtag !== 'undefined') {
    window.gtag('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
    });
  }
};

const savePreferences = async () => {
  await visitorService.identify({ hasAcceptedPrivacyPolicy: true });
  showBanner.value = false;
  showCustomize.value = false;

  // Configurar servicios según preferencias
  if (typeof window.gtag !== 'undefined') {
    window.gtag('consent', 'update', {
      analytics_storage: preferences.value.analytics ? 'granted' : 'denied',
      ad_storage: preferences.value.marketing ? 'granted' : 'denied',
    });
  }
};

onMounted(() => {
  checkConsentStatus();
});
</script>

<style scoped src="./ConsentBanner.css"></style>
```

---

## Integración con Angular

### Servicio ConsentService

```typescript
// services/consent-manager.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';

export interface Consent {
  id: string;
  visitorId: string;
  consentType: 'privacy_policy' | 'marketing' | 'analytics';
  status: 'granted' | 'revoked' | 'expired';
  version: string;
  grantedAt: string;
  revokedAt?: string;
  expiresAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConsentManagerService {
  private consentsSubject = new BehaviorSubject<Consent[]>([]);
  public consents$ = this.consentsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  constructor(private http: HttpClient) {}

  async loadConsents(): Promise<void> {
    try {
      this.loadingSubject.next(true);

      const visitorId = localStorage.getItem('visitor_id');
      const token = localStorage.getItem('visitor_token');

      if (!visitorId || !token) {
        throw new Error('No hay sesión activa');
      }

      const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

      const response: any = await this.http
        .get(`${environment.apiUrl}/api/consents/visitors/${visitorId}`, {
          headers,
        })
        .toPromise();

      this.consentsSubject.next(response.consents || []);
    } catch (error) {
      console.error('Error al cargar consentimientos:', error);
      throw error;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async revokeConsent(consentType: string, reason: string): Promise<void> {
    const visitorId = localStorage.getItem('visitor_id');
    const token = localStorage.getItem('visitor_token');

    if (!visitorId || !token) {
      throw new Error('No hay sesión activa');
    }

    const headers = new HttpHeaders()
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json');

    await this.http
      .post(
        `${environment.apiUrl}/api/consents/revoke`,
        { visitorId, consentType, reason },
        { headers }
      )
      .toPromise();

    await this.loadConsents();
  }

  async renewConsent(consentType: string, expiresAt: Date): Promise<void> {
    const visitorId = localStorage.getItem('visitor_id');
    const token = localStorage.getItem('visitor_token');

    if (!visitorId || !token) {
      throw new Error('No hay sesión activa');
    }

    const headers = new HttpHeaders()
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json');

    await this.http
      .post(
        `${environment.apiUrl}/api/consents/renew`,
        { visitorId, consentType, newExpiresAt: expiresAt.toISOString() },
        { headers }
      )
      .toPromise();

    await this.loadConsents();
  }

  hasActiveConsent(consentType: string): boolean {
    const consents = this.consentsSubject.value;
    const now = new Date();

    return consents.some(
      (c) =>
        c.consentType === consentType &&
        c.status === 'granted' &&
        (!c.expiresAt || new Date(c.expiresAt) > now)
    );
  }
}
```

### Componente ConsentBannerComponent

```typescript
// components/consent-banner/consent-banner.component.ts
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-consent-banner',
  templateUrl: './consent-banner.component.html',
  styleUrls: ['./consent-banner.component.css'],
})
export class ConsentBannerComponent implements OnInit {
  showBanner = false;
  showCustomize = false;
  preferences = {
    analytics: true,
    marketing: true,
  };

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    await this.checkConsentStatus();
  }

  private async checkConsentStatus() {
    const visitorId = localStorage.getItem('visitor_id');
    const token = localStorage.getItem('visitor_token');

    if (!visitorId || !token) {
      this.showBanner = true;
      return;
    }

    try {
      const response: any = await this.http
        .get(`${environment.apiUrl}/api/consents/visitors/${visitorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .toPromise();

      const hasPrivacy = response.consents.some(
        (c: any) => c.consentType === 'privacy_policy' && c.status === 'granted'
      );

      this.showBanner = !hasPrivacy;
    } catch (error) {
      this.showBanner = true;
    }
  }

  async acceptAll() {
    await this.identifyVisitor(true);
    this.showBanner = false;
    this.updateGoogleConsent('granted', 'granted');
  }

  async rejectAll() {
    await this.identifyVisitor(true);
    this.showBanner = false;
    this.updateGoogleConsent('denied', 'denied');
  }

  openCustomize() {
    this.showCustomize = true;
  }

  async savePreferences() {
    await this.identifyVisitor(true);
    this.showBanner = false;
    this.showCustomize = false;

    this.updateGoogleConsent(
      this.preferences.analytics ? 'granted' : 'denied',
      this.preferences.marketing ? 'granted' : 'denied'
    );
  }

  private async identifyVisitor(hasAcceptedPrivacyPolicy: boolean) {
    const payload = {
      domain: environment.domain,
      apiKey: environment.apiKey,
      hasAcceptedPrivacyPolicy,
      fingerprint: await this.generateFingerprint(),
      currentUrl: window.location.href,
      referrer: document.referrer || undefined,
    };

    const response: any = await this.http
      .post(`${environment.apiUrl}/api/visitors/identify`, payload)
      .toPromise();

    localStorage.setItem('visitor_id', response.id);
    localStorage.setItem('visitor_token', response.sessionToken);
    localStorage.setItem('visitor_session_timestamp', Date.now().toString());
  }

  private async generateFingerprint(): Promise<string> {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      navigator.platform,
    ];

    const str = components.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private updateGoogleConsent(analytics: string, ads: string) {
    if (typeof (window as any).gtag !== 'undefined') {
      (window as any).gtag('consent', 'update', {
        analytics_storage: analytics,
        ad_storage: ads,
      });
    }
  }
}
```

---

## Integración con Servicios de Terceros

### Google Analytics 4 (GA4)

```typescript
// services/google-analytics.service.ts
export class GoogleAnalyticsService {
  private measurementId: string;

  constructor(measurementId: string) {
    this.measurementId = measurementId;
  }

  /**
   * Inicializa Google Analytics con modo de consentimiento
   */
  initialize() {
    // 1. Configurar consentimiento por defecto (denegado)
    window.gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      wait_for_update: 500,
    });

    // 2. Cargar script de GA4
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
    document.head.appendChild(script);

    // 3. Inicializar gtag
    window.dataLayer = window.dataLayer || [];
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', this.measurementId);
  }

  /**
   * Actualiza el consentimiento según las preferencias del usuario
   */
  updateConsent(analytics: boolean, marketing: boolean) {
    window.gtag('consent', 'update', {
      analytics_storage: analytics ? 'granted' : 'denied',
      ad_storage: marketing ? 'granted' : 'denied',
    });
  }

  /**
   * Registra un evento personalizado
   */
  trackEvent(eventName: string, params?: Record<string, any>) {
    window.gtag('event', eventName, params);
  }

  /**
   * Registra una visualización de página
   */
  trackPageView(path: string) {
    window.gtag('event', 'page_view', {
      page_path: path,
    });
  }
}

// Declaraciones TypeScript
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}
```

### Facebook Pixel

```typescript
// services/facebook-pixel.service.ts
export class FacebookPixelService {
  private pixelId: string;

  constructor(pixelId: string) {
    this.pixelId = pixelId;
  }

  /**
   * Inicializa Facebook Pixel
   */
  initialize() {
    // Cargar script de Facebook Pixel
    !(function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod
          ? n.callMethod.apply(n, arguments)
          : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(
      window,
      document,
      'script',
      'https://connect.facebook.net/en_US/fbevents.js'
    );

    // Inicializar con consentimiento limitado
    window.fbq('consent', 'revoke');
    window.fbq('init', this.pixelId);
    window.fbq('track', 'PageView');
  }

  /**
   * Actualiza el consentimiento
   */
  updateConsent(granted: boolean) {
    if (granted) {
      window.fbq('consent', 'grant');
    } else {
      window.fbq('consent', 'revoke');
    }
  }

  /**
   * Registra un evento personalizado
   */
  trackEvent(eventName: string, params?: Record<string, any>) {
    window.fbq('track', eventName, params);
  }
}

// Declaraciones TypeScript
declare global {
  interface Window {
    fbq: (...args: any[]) => void;
    _fbq: any;
  }
}
```

### Google Tag Manager (GTM)

```typescript
// services/google-tag-manager.service.ts
export class GoogleTagManagerService {
  private containerId: string;

  constructor(containerId: string) {
    this.containerId = containerId;
  }

  /**
   * Inicializa Google Tag Manager
   */
  initialize() {
    // 1. Configurar consentimiento por defecto
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      'gtm.start': new Date().getTime(),
      event: 'gtm.js',
    });

    // 2. Cargar script de GTM
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${this.containerId}`;
    document.head.appendChild(script);

    // 3. Configurar consentimiento inicial
    this.pushConsentDefault();
  }

  /**
   * Configura el consentimiento por defecto
   */
  private pushConsentDefault() {
    window.dataLayer.push({
      event: 'consent_default',
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  /**
   * Actualiza el consentimiento
   */
  updateConsent(analytics: boolean, marketing: boolean) {
    window.dataLayer.push({
      event: 'consent_update',
      analytics_storage: analytics ? 'granted' : 'denied',
      ad_storage: marketing ? 'granted' : 'denied',
      ad_user_data: marketing ? 'granted' : 'denied',
      ad_personalization: marketing ? 'granted' : 'denied',
    });
  }

  /**
   * Envía un evento personalizado
   */
  pushEvent(eventName: string, data?: Record<string, any>) {
    window.dataLayer.push({
      event: eventName,
      ...data,
    });
  }
}
```

### Integración Completa con Gestión de Consentimientos

```typescript
// services/third-party-manager.service.ts
import { GoogleAnalyticsService } from './google-analytics.service';
import { FacebookPixelService } from './facebook-pixel.service';
import { GoogleTagManagerService } from './google-tag-manager.service';

export class ThirdPartyManager {
  private ga: GoogleAnalyticsService;
  private fbPixel: FacebookPixelService;
  private gtm: GoogleTagManagerService;

  constructor(config: {
    gaId: string;
    fbPixelId: string;
    gtmId: string;
  }) {
    this.ga = new GoogleAnalyticsService(config.gaId);
    this.fbPixel = new FacebookPixelService(config.fbPixelId);
    this.gtm = new GoogleTagManagerService(config.gtmId);
  }

  /**
   * Inicializa todos los servicios con consentimiento denegado por defecto
   */
  initializeAll() {
    this.gtm.initialize();
    this.ga.initialize();
    this.fbPixel.initialize();
  }

  /**
   * Actualiza el consentimiento en todos los servicios
   */
  updateAllConsents(analytics: boolean, marketing: boolean) {
    // Google Analytics
    this.ga.updateConsent(analytics, marketing);

    // Facebook Pixel
    this.fbPixel.updateConsent(marketing);

    // Google Tag Manager
    this.gtm.updateConsent(analytics, marketing);

    // Log para depuración
    console.log('Consentimientos actualizados:', { analytics, marketing });
  }

  /**
   * Registra un evento en todos los servicios habilitados
   */
  trackEvent(eventName: string, params?: Record<string, any>) {
    this.ga.trackEvent(eventName, params);
    this.fbPixel.trackEvent(eventName, params);
    this.gtm.pushEvent(eventName, params);
  }
}

// Uso en tu aplicación
const thirdPartyManager = new ThirdPartyManager({
  gaId: 'G-XXXXXXXXXX',
  fbPixelId: '1234567890',
  gtmId: 'GTM-XXXXXX',
});

// Inicializar al cargar la aplicación
document.addEventListener('DOMContentLoaded', () => {
  thirdPartyManager.initializeAll();
});

// Actualizar cuando el usuario da su consentimiento
function onConsentChange(analytics: boolean, marketing: boolean) {
  thirdPartyManager.updateAllConsents(analytics, marketing);
}
```

---

## Mejores Prácticas

### 1. **Inicialización Temprana**

```typescript
// main.ts o index.ts
import { ThirdPartyManager } from './services/third-party-manager.service';
import { ConsentManager } from './services/consent-manager';

// 1. Inicializar servicios de terceros con consentimiento denegado
const thirdPartyManager = new ThirdPartyManager({
  gaId: import.meta.env.VITE_GA_ID,
  fbPixelId: import.meta.env.VITE_FB_PIXEL_ID,
  gtmId: import.meta.env.VITE_GTM_ID,
});

thirdPartyManager.initializeAll();

// 2. Inicializar gestión de consentimientos
const consentManager = new ConsentManager({
  apiUrl: import.meta.env.VITE_API_URL,
  apiKey: import.meta.env.VITE_API_KEY,
  domain: import.meta.env.VITE_DOMAIN,
});

consentManager.initialize().then(() => {
  // 3. Sincronizar estado de consentimientos con servicios de terceros
  const session = consentManager.visitorService.getSession();
  if (session) {
    consentManager.consentService
      .getVisitorConsents(session.visitorId, session.token)
      .then((consents) => {
        const hasAnalytics = consentManager.consentService.hasActiveConsent(
          consents,
          'analytics'
        );
        const hasMarketing = consentManager.consentService.hasActiveConsent(
          consents,
          'marketing'
        );

        thirdPartyManager.updateAllConsents(hasAnalytics, hasMarketing);
      });
  }
});
```

### 2. **Manejo de Errores Robusto**

```typescript
// utils/error-handler.ts
export class ConsentErrorHandler {
  static handle(error: unknown, context: string): void {
    const message = error instanceof Error ? error.message : 'Error desconocido';

    console.error(`[${context}] Error:`, message);

    // Registrar en servicio de monitoreo (ej. Sentry)
    if (typeof window.Sentry !== 'undefined') {
      window.Sentry.captureException(error, {
        tags: { context },
      });
    }

    // Mostrar mensaje amigable al usuario
    const userMessage = this.getUserFriendlyMessage(error);
    this.showUserNotification(userMessage);
  }

  private static getUserFriendlyMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('NetworkError')) {
        return 'Error de conexión. Por favor, verifica tu internet.';
      }
      if (error.message.includes('401') || error.message.includes('403')) {
        return 'Tu sesión ha expirado. Por favor, recarga la página.';
      }
    }
    return 'Ocurrió un error inesperado. Por favor, intenta nuevamente.';
  }

  private static showUserNotification(message: string): void {
    // Implementar notificación al usuario
    console.warn('Notificación al usuario:', message);
  }
}

// Uso
try {
  await consentService.revokeConsent(visitorId, type, reason, token);
} catch (error) {
  ConsentErrorHandler.handle(error, 'RevokeConsent');
}
```

### 3. **Retry Logic para Requests Fallidos**

```typescript
// utils/retry.ts
export async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Intento ${attempt} de ${maxRetries} falló:`, error);

      if (attempt < maxRetries) {
        // Backoff exponencial
        const delay = delayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// Uso
const consents = await retryRequest(
  () => consentService.getVisitorConsents(visitorId, token),
  3,
  1000
);
```

### 4. **Caché Local para Mejorar Rendimiento**

```typescript
// services/consent-cache.service.ts
export class ConsentCacheService {
  private cacheKey = 'consents_cache';
  private cacheDuration = 5 * 60 * 1000; // 5 minutos

  set(consents: Consent[]): void {
    const cacheData = {
      consents,
      timestamp: Date.now(),
    };
    localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
  }

  get(): Consent[] | null {
    const cached = localStorage.getItem(this.cacheKey);
    if (!cached) return null;

    try {
      const { consents, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;

      if (age > this.cacheDuration) {
        this.clear();
        return null;
      }

      return consents;
    } catch {
      this.clear();
      return null;
    }
  }

  clear(): void {
    localStorage.removeItem(this.cacheKey);
  }
}

// Uso en ConsentService
export class ConsentService {
  private cache = new ConsentCacheService();

  async getVisitorConsents(
    visitorId: string,
    token: string,
    useCache = true
  ): Promise<Consent[]> {
    // Intentar obtener de caché
    if (useCache) {
      const cached = this.cache.get();
      if (cached) return cached;
    }

    // Fetch desde API
    const response = await fetch(
      `${this.apiUrl}/api/consents/visitors/${visitorId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error('Error al obtener consentimientos');
    }

    const data = await response.json();
    const consents = data.consents || [];

    // Guardar en caché
    this.cache.set(consents);

    return consents;
  }
}
```

### 5. **Testing**

```typescript
// tests/consent.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsentService } from '../services/consent.service';

describe('ConsentService', () => {
  let service: ConsentService;

  beforeEach(() => {
    service = new ConsentService('https://api.test.com');
    global.fetch = vi.fn();
  });

  it('debe obtener consentimientos correctamente', async () => {
    const mockConsents = [
      {
        id: '1',
        visitorId: 'visitor-1',
        consentType: 'privacy_policy',
        status: 'granted',
        version: 'v1.0.0',
        grantedAt: '2025-01-01T00:00:00.000Z',
        ipAddress: '192.168.1.1',
      },
    ];

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ consents: mockConsents }),
    });

    const consents = await service.getVisitorConsents('visitor-1', 'token-123');

    expect(consents).toEqual(mockConsents);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com/api/consents/visitors/visitor-1',
      {
        headers: { Authorization: 'Bearer token-123' },
      }
    );
  });

  it('debe manejar errores de red', async () => {
    (global.fetch as any).mockRejectedValue(new Error('NetworkError'));

    await expect(
      service.getVisitorConsents('visitor-1', 'token-123')
    ).rejects.toThrow('NetworkError');
  });
});
```

### 6. **Accesibilidad (a11y)**

```html
<!-- Asegurar que el banner sea accesible -->
<div
  class="consent-banner"
  role="dialog"
  aria-labelledby="consent-title"
  aria-describedby="consent-description"
>
  <h3 id="consent-title">Utilizamos cookies</h3>
  <p id="consent-description">
    Utilizamos cookies para mejorar tu experiencia...
  </p>
  <div class="consent-banner__actions">
    <button
      class="btn btn-primary"
      aria-label="Aceptar todas las cookies"
    >
      Aceptar Todas
    </button>
    <button
      class="btn btn-secondary"
      aria-label="Personalizar preferencias de cookies"
    >
      Personalizar
    </button>
  </div>
</div>
```

### 7. **Monitoreo y Analytics**

```typescript
// services/consent-analytics.service.ts
export class ConsentAnalyticsService {
  trackBannerShown(): void {
    this.trackEvent('consent_banner_shown', {
      timestamp: new Date().toISOString(),
    });
  }

  trackConsentGiven(type: string): void {
    this.trackEvent('consent_given', {
      consent_type: type,
      timestamp: new Date().toISOString(),
    });
  }

  trackConsentRevoked(type: string, reason: string): void {
    this.trackEvent('consent_revoked', {
      consent_type: type,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  private trackEvent(eventName: string, params: Record<string, any>): void {
    // Enviar a servicio de analytics (solo si hay consentimiento)
    if (window.gtag) {
      window.gtag('event', eventName, params);
    }

    // Log para depuración
    console.log('[ConsentAnalytics]', eventName, params);
  }
}
```

---

## Resumen de Checklist de Implementación

- [ ] **Paso 1**: Configurar variables de entorno (API_URL, API_KEY, DOMAIN)
- [ ] **Paso 2**: Implementar servicios base (VisitorService, ConsentService)
- [ ] **Paso 3**: Crear ConsentManager para gestión centralizada
- [ ] **Paso 4**: Implementar banner de consentimiento inicial
- [ ] **Paso 5**: Integrar servicios de terceros con modo consentimiento
- [ ] **Paso 6**: Añadir panel de preferencias para usuarios
- [ ] **Paso 7**: Implementar sistema de notificaciones de expiración
- [ ] **Paso 8**: Añadir tests unitarios y E2E
- [ ] **Paso 9**: Implementar monitoreo y analytics
- [ ] **Paso 10**: Validar accesibilidad (a11y)
- [ ] **Paso 11**: Realizar pruebas de compatibilidad cross-browser
- [ ] **Paso 12**: Documentar para el equipo

---

## Recursos Adicionales

- [Documentación API](./SDK_CONSENT_API.md)
- [Guía de Arquitectura](../CLAUDE.md)
- [RGPD Official](https://gdpr.eu/)
- [Google Consent Mode v2](https://support.google.com/analytics/answer/9976101)
- [Facebook Pixel Advanced Matching](https://developers.facebook.com/docs/facebook-pixel/implementation/advanced-matching)

---

**Última actualización**: Octubre 2025
**Versión**: 2.0.0
