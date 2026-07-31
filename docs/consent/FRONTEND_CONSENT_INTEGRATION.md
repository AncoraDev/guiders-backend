# Guía de Integración: Registro Automático de Consentimientos desde el Frontend

## ⚠️ IMPORTANTE: Flujo Automático de Consentimientos

Cuando el frontend llama a `/api/visitors/identify`, el backend **automáticamente**:

1. ✅ Registra el visitante en el contexto `visitors-v2`
2. ✅ **Registra el consentimiento** en el contexto `consent`:
   - Si `hasAcceptedPrivacyPolicy: true` → Registra `status: granted`
   - Si `hasAcceptedPrivacyPolicy: false` → Registra `status: denied`
3. ✅ Crea un log de auditoría en `consent_audit_logs`

**NO es necesario** hacer una llamada adicional a `/api/consents/record` o `/api/consents/deny` desde el frontend.

---

## 📋 Contrato Frontend ↔ Backend

### Endpoint: `POST /api/visitors/identify`

#### Request Body

```typescript
interface IdentifyVisitorPayload {
  // ========== CAMPOS OBLIGATORIOS ==========
  fingerprint: string;               // Browser fingerprint único
  domain: string;                    // Dominio actual (ej: "tudominio.com")
  apiKey: string;                    // API Key del sitio
  hasAcceptedPrivacyPolicy: boolean; // OBLIGATORIO: true (acepta) o false (rechaza)

  // ========== CAMPOS OPCIONALES ==========
  currentUrl?: string;               // URL completa actual
  consentVersion?: string;           // Versión de la política (default: "v1.4.0")
                                     // Acepta: "v1.4.0", "1.4.0", "v1.5.2-beta.1", "1.5.2-beta.1"
                                     // Se normaliza automáticamente agregando "v" si no lo tiene
                                     // Versión mínima requerida: v1.4.0 (con soporte SemVer)
  ipAddress?: string;                // IP del visitante (se captura automáticamente si no se envía)
  userAgent?: string;                // User-Agent (se captura automáticamente si no se envía)
}
```

#### Respuestas

##### ✅ Caso 1: Usuario ACEPTA el consentimiento (`hasAcceptedPrivacyPolicy: true`)

**HTTP Status**: `200 OK`

```typescript
interface IdentifyVisitorResponse {
  visitorId: string;       // UUID del visitante
  sessionId: string;       // UUID de la sesión (creada con éxito)
  lifecycle: string;       // Estado del visitante: "anon" | "engaged" | "lead" | "converted"
  isNewVisitor: boolean;   // true si es un visitante nuevo
  consentStatus: string;   // "granted" - consentimiento aceptado
  allowedActions: string[]; // ["chat", "forms", "tracking", "all"] - todas las acciones permitidas
}
```

```json
{
  "visitorId": "4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be",
  "sessionId": "7c8d9e0f-1a2b-3c4d-5e6f-7a8b9c0d1e2f",
  "lifecycle": "anon",
  "isNewVisitor": true,
  "consentStatus": "granted",
  "allowedActions": ["chat", "forms", "tracking", "all"]
}
```

##### ❌ Caso 2: Usuario RECHAZA el consentimiento (`hasAcceptedPrivacyPolicy: false`)

**HTTP Status**: `400 Bad Request`

```typescript
interface ConsentDeniedResponse {
  message: string;         // Mensaje explicativo
  visitorId: string;       // UUID del visitante (se crea visitante anónimo)
  sessionId: null;         // null - NO se crea sesión
  lifecycle: string;       // "anon" - visitante anónimo
  isNewVisitor: boolean;   // true si es un visitante nuevo
  consentStatus: string;   // "denied" - consentimiento rechazado
  allowedActions: string[]; // ["read_only"] - solo lectura, funciones limitadas
}
```

```json
{
  "message": "Se requiere aceptar la política de privacidad para usar todas las funciones",
  "visitorId": "4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be",
  "sessionId": null,
  "lifecycle": "anon",
  "isNewVisitor": true,
  "consentStatus": "denied",
  "allowedActions": ["read_only"]
}
```

**⚠️ Importante**: Aunque retorna HTTP 400, **NO es un error fatal**:
- El visitante SÍ se crea en la base de datos
- El rechazo SÍ se registra para cumplimiento RGPD
- El frontend debe permitir navegación limitada
- El usuario puede cambiar su decisión más adelante

---

## 🔄 Flujos Internos del Backend

### Flujo 1: Usuario ACEPTA el consentimiento

```typescript
// Archivo: src/context/visitors-v2/application/commands/identify-visitor.command-handler.ts

async execute(command: IdentifyVisitorCommand): Promise<IdentifyVisitorResponseDto> {
  // 1. Validar API Key
  const apiKeyValid = await this.apiKeyValidator.validate({ ... });

  // 2. Resolver dominio → tenantId/siteId
  const company = await this.companyRepository.findByDomain(normalizedDomain);
  const targetSite = findSiteByDomain(company, normalizedDomain);

  // 3. Buscar o crear visitante
  const existingVisitor = await this.visitorRepository.findByFingerprintAndSite(...);

  if (existingVisitor.isOk()) {
    visitor = existingVisitor.value;
    visitor.startNewSession(); // ← Crear nueva sesión
  } else {
    visitor = VisitorV2.create({ ... }); // ← Crear visitante con sesión
  }

  // 4. Guardar visitante
  await this.visitorRepository.save(visitor);
  visitorContext.commit();

  // 5. ✅ REGISTRO AUTOMÁTICO DE CONSENTIMIENTO (GRANTED)
  const recordConsentCommand = new RecordConsentCommand(
    visitor.getId().value,
    'privacy_policy',
    consentVersion,
    command.ipAddress,
    command.userAgent,
    { fingerprint, domain, currentUrl }
  );

  await this.commandBus.execute(recordConsentCommand);
  // → Crea documento en MongoDB: status = "granted"
  // → Emite ConsentGrantedEvent
  // → Crea audit log: actionType = "consent_granted"

  return {
    visitorId: visitor.getId().value,
    sessionId: currentSession.getId().value, // ← Sesión creada
    lifecycle: visitor.getLifecycle().getValue(),
    isNewVisitor,
    consentStatus: 'granted',
    allowedActions: ['chat', 'forms', 'tracking', 'all'],
  };
}
```

### Flujo 2: Usuario RECHAZA el consentimiento

```typescript
// Archivo: src/context/visitors-v2/application/commands/identify-visitor.command-handler.ts

async execute(command: IdentifyVisitorCommand): Promise<IdentifyVisitorResponseDto> {
  // 1. Validar API Key
  const apiKeyValid = await this.apiKeyValidator.validate({ ... });

  // 2. Resolver dominio → tenantId/siteId
  const company = await this.companyRepository.findByDomain(normalizedDomain);
  const targetSite = findSiteByDomain(company, normalizedDomain);

  // 3. ⚠️ MANEJO ESPECIAL: Usuario rechazó el consentimiento
  if (!command.hasAcceptedPrivacyPolicy) {
    // Crear visitante anónimo SIN sesión
    const visitor = VisitorV2.create({
      id: VisitorId.random(),
      tenantId,
      siteId,
      fingerprint,
      lifecycle: VisitorLifecycle.ANON,
    });

    // Guardar visitante
    await this.visitorRepository.save(visitor);
    visitorContext.commit();

    // ✅ REGISTRO AUTOMÁTICO DE RECHAZO (DENIED)
    const denyCommand = new DenyConsentCommand(
      visitor.getId().value,
      'privacy_policy',
      command.ipAddress,
      command.userAgent,
      {
        fingerprint: command.fingerprint,
        domain: normalizedDomain,
        currentUrl: command.currentUrl,
        reason: 'User explicitly denied consent',
      }
    );

    await this.commandBus.execute(denyCommand);
    // → Crea documento en MongoDB: status = "denied"
    // → Emite ConsentDeniedEvent
    // → Crea audit log: actionType = "consent_denied"

    // Lanzar BadRequestException con datos estructurados
    throw new BadRequestException({
      message: 'Se requiere aceptar la política de privacidad',
      visitorId: visitor.getId().value,
      sessionId: null, // ← NO se crea sesión
      lifecycle: visitor.getLifecycle().getValue(),
      isNewVisitor: true,
      consentStatus: 'denied',
      allowedActions: ['read_only'],
    });
  }

  // ... continúa con flujo normal (aceptación)
}
```

---

## 🗄️ Datos Registrados en MongoDB

### Caso 1: Consentimiento ACEPTADO

#### Colección: `visitor_consents`

```json
{
  "_id": "11111111-1111-4111-8111-111111111111",
  "visitorId": "4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be",
  "consentType": "privacy_policy",
  "status": "granted",
  "version": "v1.4.0",
  "grantedAt": "2025-10-10T12:00:00.000Z",
  "expiresAt": "2026-10-10T12:00:00.000Z",
  "revokedAt": null,
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "fingerprint": "1039590477",
    "domain": "127.0.0.1",
    "currentUrl": "http://127.0.0.1:5173/"
  },
  "createdAt": "2025-10-10T12:00:00.000Z",
  "updatedAt": "2025-10-10T12:00:00.000Z"
}
```

#### Colección: `consent_audit_logs`

```json
{
  "_id": "22222222-2222-4222-8222-222222222222",
  "consentId": "11111111-1111-4111-8111-111111111111",
  "visitorId": "4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be",
  "actionType": "consent_granted",
  "consentType": "privacy_policy",
  "timestamp": "2025-10-10T12:00:00.000Z",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "fingerprint": "1039590477",
    "domain": "127.0.0.1",
    "currentUrl": "http://127.0.0.1:5173/"
  }
}
```

### Caso 2: Consentimiento RECHAZADO

#### Colección: `visitor_consents`

```json
{
  "_id": "33333333-3333-4333-8333-333333333333",
  "visitorId": "5cc55f9e-1f3e-5e6b-9947-9f22g61gc2cf",
  "consentType": "privacy_policy",
  "status": "denied",
  "version": "v1.4.0",
  "grantedAt": "2025-10-10T12:00:00.000Z",
  "revokedAt": null,
  "expiresAt": null,
  "ipAddress": "192.168.1.101",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "fingerprint": "2048601588",
    "domain": "127.0.0.1",
    "currentUrl": "http://127.0.0.1:5173/",
    "reason": "User explicitly denied consent"
  },
  "createdAt": "2025-10-10T12:00:00.000Z",
  "updatedAt": "2025-10-10T12:00:00.000Z"
}
```

#### Colección: `consent_audit_logs`

```json
{
  "_id": "44444444-4444-4444-8444-444444444444",
  "consentId": "33333333-3333-4333-8333-333333333333",
  "visitorId": "5cc55f9e-1f3e-5e6b-9947-9f22g61gc2cf",
  "actionType": "consent_denied",
  "consentType": "privacy_policy",
  "timestamp": "2025-10-10T12:00:00.000Z",
  "ipAddress": "192.168.1.101",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "deniedAt": "2025-10-10T12:00:00.000Z",
    "fingerprint": "2048601588",
    "domain": "127.0.0.1",
    "currentUrl": "http://127.0.0.1:5173/",
    "reason": "User explicitly denied consent"
  }
}
```

---

## 📝 Ejemplo Completo: Integración Frontend

### TypeScript/JavaScript SDK

```typescript
class GuidersSDK {
  private apiUrl = 'http://localhost:3000/api';
  private visitorId: string | null = null;
  private sessionId: string | null = null;
  private consentStatus: 'granted' | 'denied' | 'pending' = 'pending';
  private allowedActions: string[] = [];

  /**
   * Identifica al visitante y registra automáticamente el consentimiento
   * @returns Promise con los datos del visitante
   */
  async identifyVisitor(options: {
    fingerprint: string;
    domain: string;
    apiKey: string;
    hasAcceptedPrivacyPolicy: boolean;
    consentVersion?: string;
    currentUrl?: string;
  }): Promise<{
    visitorId: string;
    sessionId: string | null;
    consentStatus: string;
    allowedActions: string[];
  }> {
    try {
      const response = await fetch(`${this.apiUrl}/visitors/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ← Importante para recibir cookie 'sid'
        body: JSON.stringify({
          fingerprint: options.fingerprint,
          domain: options.domain,
          apiKey: options.apiKey,
          hasAcceptedPrivacyPolicy: options.hasAcceptedPrivacyPolicy,
          consentVersion: options.consentVersion || 'v1.4.0',
          currentUrl: options.currentUrl || window.location.href,
        }),
      });

      // ✅ Caso de éxito: Usuario aceptó (HTTP 200)
      if (response.ok) {
        const data = await response.json();

        this.visitorId = data.visitorId;
        this.sessionId = data.sessionId;
        this.consentStatus = data.consentStatus || 'granted';
        this.allowedActions = data.allowedActions || ['chat', 'forms', 'tracking'];

        console.log('✅ Visitante identificado con consentimiento ACEPTADO:', data);

        return {
          visitorId: data.visitorId,
          sessionId: data.sessionId,
          consentStatus: this.consentStatus,
          allowedActions: this.allowedActions,
        };
      }

      // ⚠️ Caso especial: Usuario rechazó (HTTP 400)
      if (response.status === 400) {
        const error = await response.json();

        // Verificar que es un rechazo de consentimiento
        if (error.consentStatus === 'denied') {
          this.visitorId = error.visitorId;
          this.sessionId = null; // No hay sesión
          this.consentStatus = 'denied';
          this.allowedActions = error.allowedActions || ['read_only'];

          console.warn('⚠️ Visitante identificado con consentimiento RECHAZADO:', error);

          return {
            visitorId: error.visitorId,
            sessionId: null,
            consentStatus: 'denied',
            allowedActions: this.allowedActions,
          };
        }
      }

      // ❌ Otros errores
      const errorText = await response.text();
      throw new Error(`Error al identificar visitante: ${errorText}`);

    } catch (error) {
      console.error('❌ Error en identifyVisitor:', error);
      throw error;
    }
  }

  /**
   * Verifica si una acción específica está permitida
   */
  canPerformAction(action: string): boolean {
    if (this.consentStatus === 'granted') {
      return true; // Todas las acciones permitidas
    }

    if (this.consentStatus === 'denied') {
      return this.allowedActions.includes(action) || this.allowedActions.includes('read_only');
    }

    return false; // Consentimiento pendiente
  }

  /**
   * Obtiene el mensaje apropiado según el estado del consentimiento
   */
  getConsentMessage(): string {
    switch (this.consentStatus) {
      case 'granted':
        return 'Gracias por aceptar nuestra política de privacidad. Puedes usar todas las funciones.';
      case 'denied':
        return 'Has rechazado la política de privacidad. Puedes navegar en modo limitado. Puedes cambiar tu decisión en cualquier momento.';
      case 'pending':
        return 'Por favor, acepta o rechaza nuestra política de privacidad para continuar.';
    }
  }

  /**
   * Consulta los consentimientos registrados
   */
  async getConsents(): Promise<{ consents: any[]; total: number }> {
    if (!this.visitorId) {
      throw new Error('Visitante no identificado');
    }

    const response = await fetch(
      `${this.apiUrl}/consents/visitors/${this.visitorId}`,
      { credentials: 'include' }
    );

    if (!response.ok) {
      throw new Error('Error al obtener consentimientos');
    }

    return response.json();
  }
}

// ========== EJEMPLO DE USO ==========

const sdk = new GuidersSDK();

// Generar fingerprint (usando FingerprintJS o similar)
async function generateFingerprint(): Promise<string> {
  // Implementación simplificada
  return `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Escenario 1: Usuario ACEPTA la política
document.getElementById('accept-privacy-btn')?.addEventListener('click', async () => {
  try {
    const result = await sdk.identifyVisitor({
      fingerprint: await generateFingerprint(),
      domain: window.location.hostname,
      apiKey: 'YOUR_API_KEY_HERE',
      hasAcceptedPrivacyPolicy: true, // ← Usuario ACEPTÓ
      consentVersion: '1.4.0',
      currentUrl: window.location.href,
    });

    // HTTP 200 - Consentimiento aceptado
    console.log('Estado:', result.consentStatus); // "granted"
    console.log('Sesión creada:', result.sessionId); // UUID
    console.log('Acciones permitidas:', result.allowedActions); // ["chat", "forms", "tracking", "all"]

    // Habilitar todas las funciones
    enableChatWidget();
    enableContactForms();
    enableAnalytics();

    // Ocultar banner de cookies
    hideCookieBanner();

    // Mostrar mensaje de éxito
    showNotification(sdk.getConsentMessage(), 'success');

  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al procesar tu decisión', 'error');
  }
});

// Escenario 2: Usuario RECHAZA la política
document.getElementById('reject-privacy-btn')?.addEventListener('click', async () => {
  try {
    const result = await sdk.identifyVisitor({
      fingerprint: await generateFingerprint(),
      domain: window.location.hostname,
      apiKey: 'YOUR_API_KEY_HERE',
      hasAcceptedPrivacyPolicy: false, // ← Usuario RECHAZÓ
      consentVersion: '1.4.0',
      currentUrl: window.location.href,
    });

    // HTTP 400 - Consentimiento rechazado (pero manejado correctamente)
    console.log('Estado:', result.consentStatus); // "denied"
    console.log('Sesión creada:', result.sessionId); // null
    console.log('Acciones permitidas:', result.allowedActions); // ["read_only"]

    // Deshabilitar funciones que requieren consentimiento
    disableChatWidget();
    disableContactForms();
    disableAnalytics();

    // Permitir navegación básica
    enableReadOnlyMode();

    // Ocultar banner de cookies
    hideCookieBanner();

    // Mostrar mensaje informativo
    showNotification(sdk.getConsentMessage(), 'info');

    // Mostrar botón para cambiar decisión
    showChangeDecisionButton();

  } catch (error) {
    console.error('Error:', error);
    showNotification('Error al procesar tu decisión', 'error');
  }
});

// Funciones auxiliares (implementar según tu UI)
function enableChatWidget() {
  if (sdk.canPerformAction('chat')) {
    document.getElementById('chat-widget')?.classList.remove('disabled');
  }
}

function disableChatWidget() {
  document.getElementById('chat-widget')?.classList.add('disabled');
  document.getElementById('chat-widget')?.setAttribute('title', 'Requiere aceptar la política de privacidad');
}

function enableReadOnlyMode() {
  console.log('Modo de solo lectura habilitado');
  // Permitir navegación, lectura de contenido, etc.
}

function showChangeDecisionButton() {
  const button = document.createElement('button');
  button.textContent = 'Cambiar mi decisión';
  button.onclick = () => {
    showCookieBanner(); // Mostrar banner nuevamente
  };
  document.body.appendChild(button);
}

function showNotification(message: string, type: 'success' | 'error' | 'info') {
  // Implementar notificación toast
  console.log(`[${type}] ${message}`);
}
```

### React/Vue Ejemplo

```typescript
// React Hook para gestión de consentimientos
import { useState, useEffect } from 'react';

interface ConsentState {
  visitorId: string | null;
  sessionId: string | null;
  consentStatus: 'granted' | 'denied' | 'pending';
  allowedActions: string[];
  isLoading: boolean;
  error: string | null;
}

export function useConsent() {
  const [state, setState] = useState<ConsentState>({
    visitorId: null,
    sessionId: null,
    consentStatus: 'pending',
    allowedActions: [],
    isLoading: false,
    error: null,
  });

  const identifyVisitor = async (hasAccepted: boolean) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/visitors/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fingerprint: await generateFingerprint(),
          domain: window.location.hostname,
          apiKey: process.env.REACT_APP_GUIDERS_API_KEY,
          hasAcceptedPrivacyPolicy: hasAccepted,
          consentVersion: '1.4.0',
          currentUrl: window.location.href,
        }),
      });

      // Caso de aceptación (HTTP 200)
      if (response.ok) {
        const data = await response.json();
        setState({
          visitorId: data.visitorId,
          sessionId: data.sessionId,
          consentStatus: data.consentStatus || 'granted',
          allowedActions: data.allowedActions || [],
          isLoading: false,
          error: null,
        });
        return;
      }

      // Caso de rechazo (HTTP 400)
      if (response.status === 400) {
        const error = await response.json();
        if (error.consentStatus === 'denied') {
          setState({
            visitorId: error.visitorId,
            sessionId: null,
            consentStatus: 'denied',
            allowedActions: error.allowedActions || ['read_only'],
            isLoading: false,
            error: null,
          });
          return;
        }
      }

      throw new Error('Error inesperado');

    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message,
      }));
    }
  };

  const acceptConsent = () => identifyVisitor(true);
  const rejectConsent = () => identifyVisitor(false);

  const canPerformAction = (action: string): boolean => {
    if (state.consentStatus === 'granted') return true;
    if (state.consentStatus === 'denied') {
      return state.allowedActions.includes(action);
    }
    return false;
  };

  return {
    ...state,
    acceptConsent,
    rejectConsent,
    canPerformAction,
  };
}

// Componente de Banner de Consentimiento
export function ConsentBanner() {
  const { consentStatus, acceptConsent, rejectConsent, isLoading } = useConsent();

  if (consentStatus !== 'pending') {
    return null; // Ocultar banner si ya hay decisión
  }

  return (
    <div className="consent-banner">
      <p>
        Usamos cookies para mejorar tu experiencia.
        <a href="/privacy-policy">Leer política de privacidad</a>
      </p>
      <div className="consent-actions">
        <button
          onClick={acceptConsent}
          disabled={isLoading}
          className="btn-accept"
        >
          Aceptar todas
        </button>
        <button
          onClick={rejectConsent}
          disabled={isLoading}
          className="btn-reject"
        >
          Rechazar
        </button>
      </div>
    </div>
  );
}

// Componente condicional basado en consentimiento
export function ChatWidget() {
  const { canPerformAction, consentStatus } = useConsent();

  if (!canPerformAction('chat')) {
    return (
      <div className="chat-widget-disabled">
        <p>Chat deshabilitado. Debes aceptar la política de privacidad.</p>
      </div>
    );
  }

  return <div className="chat-widget">{/* Implementación del chat */}</div>;
}
```

---

## ✅ Checklist de Integración Frontend

| Paso | Descripción | Estado |
|------|-------------|--------|
| 1 | Implementar generación de fingerprint único | ⏳ |
| 2 | Crear UI para banner de consentimiento (Aceptar/Rechazar) | ⏳ |
| 3 | Implementar llamada a `/api/visitors/identify` | ⏳ |
| 4 | Manejar respuesta HTTP 200 (aceptación) | ⏳ |
| 5 | Manejar respuesta HTTP 400 (rechazo) | ⏳ |
| 6 | Guardar `visitorId` y `sessionId` en localStorage/sessionStorage | ⏳ |
| 7 | Implementar restricciones según `allowedActions` | ⏳ |
| 8 | Deshabilitar chat/forms cuando `consentStatus === 'denied'` | ⏳ |
| 9 | Mostrar botón "Cambiar mi decisión" en modo rechazado | ⏳ |
| 10 | Probar ambos flujos (aceptación y rechazo) | ⏳ |

---

## 🔗 Referencias

- [CONSENT_REJECTION_IMPLEMENTATION.md](./CONSENT_REJECTION_IMPLEMENTATION.md) - Documentación técnica de la implementación
- [CONSENT_SCENARIOS_RGPD.md](./CONSENT_SCENARIOS_RGPD.md) - Análisis de escenarios RGPD
- [CONSENT_AUTH_GUIDE.md](./CONSENT_AUTH_GUIDE.md) - Guía de autenticación dual

---

## 🔐 Compatibilidad Semántica de Versiones (SemVer)

### ¿Qué es SemVer?

El backend soporta **Compatibilidad Semántica de Versiones** para las versiones de consentimiento. Esto significa:

- ✅ **MINOR** y **PATCH** superiores son aceptadas automáticamente
- ❌ **MAJOR** diferentes son rechazadas

**Ejemplo**: Si el backend requiere `v1.4.0`:
- ✅ `v1.4.0` - Aceptada (exacta)
- ✅ `v1.4.1` - Aceptada (patch mayor)
- ✅ `v1.5.0` - Aceptada (minor mayor)
- ✅ `v1.6.2` - Aceptada (minor y patch mayores)
- ❌ `v2.0.0` - Rechazada (major diferente)
- ❌ `v1.3.0` - Rechazada (minor menor)
- ❌ `v0.9.0` - Rechazada (major diferente)

### Configuración

La compatibilidad SemVer está **habilitada por defecto** en todos los entornos. Si deseas deshabilitarla, contacta al equipo de backend para configurar `ENABLE_SEMVER_COMPATIBILITY=false`.

### Recomendaciones

1. **Usa siempre la versión actual o superior** para evitar problemas de compatibilidad
2. **No especifiques versiones antiguas** a menos que sea absolutamente necesario
3. **Deja que el backend use su versión por defecto** omitiendo el campo `consentVersion`

```typescript
// ✅ Recomendado: Deja que el backend use su versión actual
await sdk.identifyVisitor({
  fingerprint: await generateFingerprint(),
  domain: window.location.hostname,
  apiKey: 'YOUR_API_KEY',
  hasAcceptedPrivacyPolicy: true,
  // NO especificar consentVersion - el backend usará v1.4.0 automáticamente
});

// ⚠️ Alternativa: Especifica versión igual o superior
await sdk.identifyVisitor({
  fingerprint: await generateFingerprint(),
  domain: window.location.hostname,
  apiKey: 'YOUR_API_KEY',
  hasAcceptedPrivacyPolicy: true,
  consentVersion: '1.4.0', // o '1.5.0', '1.4.1', etc.
});

// ❌ NO hacer: Usar versión obsoleta
await sdk.identifyVisitor({
  fingerprint: await generateFingerprint(),
  domain: window.location.hostname,
  apiKey: 'YOUR_API_KEY',
  hasAcceptedPrivacyPolicy: true,
  consentVersion: '1.0.0', // ← ESTO FALLARÁ
});
```

---

**Última actualización**: Enero 2025
**Versión**: 2.1.0 (actualizado con soporte SemVer y versión v1.4.0)
