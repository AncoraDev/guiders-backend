# Escenarios de Consentimiento RGPD - Análisis Completo

## 📋 Resumen Ejecutivo

Este documento analiza los **3 escenarios principales** de consentimiento RGPD en el sistema Guiders:

1. ✅ **Usuario ACEPTA** el consentimiento
2. ❌ **Usuario RECHAZA** el consentimiento
3. ⚠️  **Usuario NO TOMA ACCIÓN** (sin decisión)

---

## 🔍 Escenario 1: Usuario ACEPTA el Consentimiento

### Flujo Frontend

```typescript
// Usuario hace clic en "Aceptar" en el banner de cookies
const acceptConsent = async () => {
  const response = await fetch('/api/visitors/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      fingerprint: await generateFingerprint(),
      domain: window.location.hostname,
      apiKey: 'your-api-key',
      hasAcceptedPrivacyPolicy: true, // ← ACEPTA
      consentVersion: '1.0.0',
      currentUrl: window.location.href,
    }),
  });

  const data = await response.json();
  console.log('✅ Visitante identificado:', data.visitorId);
};
```

### Flujo Backend

```
1. POST /api/visitors/identify (hasAcceptedPrivacyPolicy: true)
   ↓
2. IdentifyVisitorCommandHandler.execute()
   ↓
3. ✅ Validación OK: hasAcceptedPrivacyPolicy === true
   ↓
4. ✅ Crear/Actualizar VisitorV2 en MongoDB
   ↓
5. ✅ Iniciar nueva Session
   ↓
6. ✅ Ejecutar RecordConsentCommand
   ↓
7. ✅ Guardar en MongoDB:
      - visitor_consents (status: "granted")
      - consent_audit_logs (actionType: "consent_granted")
   ↓
8. ✅ Retornar { visitorId, sessionId, lifecycle: "anon" }
```

### Resultado

| Campo | Valor |
|-------|-------|
| **HTTP Status** | 200 OK |
| **Visitante creado** | ✅ Sí |
| **Sesión iniciada** | ✅ Sí |
| **Consentimiento registrado** | ✅ Sí (status: `granted`) |
| **Puede usar chat** | ✅ Sí |
| **Puede usar funciones** | ✅ Todas |
| **Datos en MongoDB** | ✅ `visitor_consents` + `consent_audit_logs` |

### Datos en MongoDB

**Colección: `visitor_consents`**
```json
{
  "_id": "11111111-1111-4111-8111-111111111111",
  "visitorId": "1e01cc21-8568-4ad2-bd1d-0851b4dafdbb",
  "consentType": "privacy_policy",
  "status": "granted",
  "version": "v1.0.0",
  "grantedAt": "2025-10-11T08:35:00.000Z",
  "expiresAt": "2026-10-11T08:35:00.000Z",
  "revokedAt": null,
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "fingerprint": "abc123",
    "domain": "example.com",
    "currentUrl": "https://example.com/home"
  }
}
```

**Colección: `consent_audit_logs`**
```json
{
  "_id": "22222222-2222-4222-8222-222222222222",
  "consentId": "11111111-1111-4111-8111-111111111111",
  "visitorId": "1e01cc21-8568-4ad2-bd1d-0851b4dafdbb",
  "actionType": "consent_granted",
  "consentType": "privacy_policy",
  "timestamp": "2025-10-11T08:35:00.000Z",
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0..."
}
```

---

## ❌ Escenario 2: Usuario RECHAZA el Consentimiento

### Flujo Frontend

```typescript
// Usuario hace clic en "Rechazar" en el banner de cookies
const rejectConsent = async () => {
  const response = await fetch('/api/visitors/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      fingerprint: await generateFingerprint(),
      domain: window.location.hostname,
      apiKey: 'your-api-key',
      hasAcceptedPrivacyPolicy: false, // ← RECHAZA
      consentVersion: '1.0.0',
      currentUrl: window.location.href,
    }),
  });

  if (!response.ok) {
    console.error('❌ Error:', response.status);
  }
};
```

### Flujo Backend (ACTUAL)

```
1. POST /api/visitors/identify (hasAcceptedPrivacyPolicy: false)
   ↓
2. IdentifyVisitorCommandHandler.execute()
   ↓
3. ❌ Validación FALLA: hasAcceptedPrivacyPolicy === false
   ↓
4. ❌ Lanza Error: "El visitante debe aceptar la política de privacidad"
   ↓
5. ❌ NO se crea visitante
   ↓
6. ❌ NO se crea sesión
   ↓
7. ❌ NO se registra consentimiento
   ↓
8. ❌ Retorna HTTP 500 (Error interno)
```

### Resultado (ACTUAL)

| Campo | Valor |
|-------|-------|
| **HTTP Status** | 500 Internal Server Error ❌ |
| **Visitante creado** | ❌ No |
| **Sesión iniciada** | ❌ No |
| **Consentimiento registrado** | ❌ No |
| **Puede usar chat** | ❌ No |
| **Puede usar funciones** | ❌ Ninguna |
| **Datos en MongoDB** | ❌ Nada |

### Respuesta de Error

```json
{
  "statusCode": 500,
  "message": "Error interno al identificar visitante",
  "error": "Internal Server Error"
}
```

---

## ⚠️  Escenario 3: Usuario NO TOMA ACCIÓN

### Flujo Frontend

```typescript
// Usuario visualiza el banner pero NO hace clic en ningún botón
// Banner permanece visible
// NO se llama a /api/visitors/identify

// Usuario puede:
// - Navegar por la página (solo lectura)
// - Ver contenido público
// - NO puede usar chat
// - NO puede enviar formularios
```

### Flujo Backend (ACTUAL)

```
1. ⚠️  Sin llamada a /api/visitors/identify
   ↓
2. ⚠️  Backend no recibe ninguna petición
   ↓
3. ⚠️  NO se crea visitante
   ↓
4. ⚠️  NO se crea sesión
   ↓
5. ⚠️  NO se registra consentimiento
```

### Resultado (ACTUAL)

| Campo | Valor |
|-------|-------|
| **HTTP Status** | N/A (sin llamada) |
| **Visitante creado** | ⚠️  No |
| **Sesión iniciada** | ⚠️  No |
| **Consentimiento registrado** | ⚠️  No |
| **Puede usar chat** | ⚠️  No |
| **Puede usar funciones** | ⚠️  Solo lectura |
| **Datos en MongoDB** | ⚠️  Nada |

---

## 📊 Tabla Comparativa de Escenarios

| Aspecto | ACEPTA | RECHAZA | SIN ACCIÓN |
|---------|--------|---------|------------|
| **Llamada a `/identify`** | ✅ Sí | ✅ Sí | ❌ No |
| **`hasAcceptedPrivacyPolicy`** | `true` | `false` | N/A |
| **HTTP Status** | 200 OK | 500 Error | N/A |
| **Visitante creado** | ✅ Sí | ❌ No | ❌ No |
| **Sesión iniciada** | ✅ Sí | ❌ No | ❌ No |
| **Consentimiento en DB** | ✅ Sí (`granted`) | ❌ No | ❌ No |
| **Puede usar chat** | ✅ Sí | ❌ No | ❌ No |
| **Puede navegar** | ✅ Sí | ❌ No | ⚠️  Limitado |

---

## ⚠️  Problemas Actuales

### 1. Escenario 2 (Rechazo) - Problemas Identificados

#### ❌ Problema 1: HTTP 500 en lugar de 400
**Actual**: `500 Internal Server Error`
**Esperado**: `400 Bad Request`

**Causa**: El error se lanza dentro del handler y no se captura correctamente.

**Código actual** (`identify-visitor.command-handler.ts:73-77`):
```typescript
if (!command.hasAcceptedPrivacyPolicy) {
  throw new Error(
    'El visitante debe aceptar la política de privacidad antes de ser identificado (RGPD Art. 7.1)',
  );
}
```

**Solución recomendada**:
```typescript
if (!command.hasAcceptedPrivacyPolicy) {
  throw new BadRequestException(
    'El visitante debe aceptar la política de privacidad (RGPD Art. 7.1)',
  );
}
```

---

#### ❌ Problema 2: No se registra el rechazo
**Actual**: No se guarda ningún registro del rechazo
**Esperado**: Registrar consentimiento con `status: "denied"`

**Impacto RGPD**: Violación del Art. 5.2 (responsabilidad proactiva) - no podemos demostrar que el usuario rechazó explícitamente.

**Solución recomendada**:
```typescript
if (!command.hasAcceptedPrivacyPolicy) {
  // Crear visitante anónimo
  const visitor = VisitorV2.createAnonymous({ fingerprint, siteId, tenantId });
  await this.visitorRepository.save(visitor);

  // Registrar rechazo
  const denyCommand = new DenyConsentCommand(
    visitor.getId().value,
    'privacy_policy',
    command.ipAddress,
    command.userAgent,
    { reason: 'User explicitly denied consent' }
  );
  await this.commandBus.execute(denyCommand);

  throw new BadRequestException({
    message: 'Consentimiento requerido para usar el sistema',
    visitorId: visitor.getId().value,
    allowedActions: ['read_only'],
  });
}
```

---

#### ❌ Problema 3: No se permite navegación limitada
**Actual**: El usuario no puede hacer nada
**Esperado**: Permitir navegación en modo "solo lectura"

**Solución frontend**:
```typescript
// Si el usuario rechaza, permitir navegación limitada
if (consentStatus === 'denied') {
  // Deshabilitar funciones interactivas
  disableChatWidget();
  disableContactForms();
  disableNewsletterSubscription();

  // Permitir solo visualización
  allowReadOnlyNavigation();
}
```

---

### 2. Escenario 3 (Sin Acción) - Consideraciones

#### ⚠️  Consideración 1: Navegación sin decisión
**Actual**: Frontend no llama al backend hasta que hay decisión
**RGPD**: Correcto según Art. 4.11 (consentimiento explícito)

**Recomendación**: Mantener comportamiento actual pero considerar:
- Mostrar banner persistente
- Permitir navegación limitada
- Recordar decisión en localStorage (no es consentimiento)

#### ⚠️  Consideración 2: Tracking anónimo
**Pregunta**: ¿Debemos crear un visitante anónimo para analytics básicos?

**Opciones**:

**Opción A (Más estricta - RGPD)**:
- NO crear visitante hasta decisión
- NO trackear nada
- Esperar decisión explícita

**Opción B (Más flexible)**:
- Crear visitante SOLO con fingerprint (no datos personales)
- Trackear métricas básicas (páginas vistas, tiempo en sitio)
- NO enviar datos a terceros
- Eliminar datos si rechaza

---

## ✅ Mejoras Recomendadas

### Mejora 1: Soporte para Rechazo de Consentimiento

#### Backend: Crear `DenyConsentCommand`

**Archivo**: `src/context/consent/application/commands/deny-consent.command.ts`
```typescript
/**
 * Command para registrar un rechazo de consentimiento
 * RGPD Art. 5.2: Responsabilidad proactiva - demostrar cumplimiento
 */
export class DenyConsentCommand {
  constructor(
    public readonly visitorId: string,
    public readonly consentType: string,
    public readonly ipAddress: string,
    public readonly userAgent?: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}
}
```

#### Backend: Modificar `IdentifyVisitorCommandHandler`

```typescript
// Si no acepta, crear visitante anónimo y registrar rechazo
if (!command.hasAcceptedPrivacyPolicy) {
  const visitor = VisitorV2.createAnonymous({
    id: VisitorId.random(),
    tenantId,
    siteId,
    fingerprint,
  });

  await this.visitorRepository.save(visitor);

  // Registrar rechazo
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
    },
  );

  await this.commandBus.execute(denyCommand);

  return new IdentifyVisitorResponseDto({
    visitorId: visitor.getId().value,
    sessionId: null, // Sin sesión
    lifecycle: 'anon',
    isNewVisitor: true,
    consentStatus: 'denied',
    allowedActions: ['read_only'],
  });
}
```

#### Frontend: Manejar rechazo

```typescript
const response = await fetch('/api/visitors/identify', {
  method: 'POST',
  body: JSON.stringify({
    hasAcceptedPrivacyPolicy: false,
    // ...
  }),
});

const data = await response.json();

if (data.consentStatus === 'denied') {
  // Deshabilitar funciones interactivas
  disableChatWidget();
  disableContactForms();

  // Permitir solo lectura
  allowReadOnlyNavigation();

  // Mostrar mensaje
  showToast('Has rechazado el consentimiento. Navegación limitada disponible.');
}
```

---

### Mejora 2: Soporte para Navegación sin Decisión

#### Frontend: Modo "Sin decisión"

```typescript
// Usuario visualiza banner pero no hace clic
let consentDecision = localStorage.getItem('consent_decision'); // null

if (!consentDecision) {
  // Permitir navegación básica
  allowBasicNavigation();

  // Deshabilitar funciones que requieren consentimiento
  disableChatWidget();
  disableContactForms();
  disableThirdPartyTrackers();

  // Mostrar banner persistente
  showConsentBanner({
    persistent: true,
    position: 'bottom',
  });

  // NO llamar a /api/visitors/identify hasta que haya decisión
}
```

---

## 📜 Cumplimiento RGPD

### Artículos Relevantes

#### ✅ Art. 7.1 - Capacidad de demostrar el consentimiento
**Estado**: ✅ Implementado
- Sistema registra consentimientos en `visitor_consents`
- Audit logs en `consent_audit_logs`
- Timestamp, IP, User-Agent registrados

#### ⚠️  Art. 4.11 - Consentimiento explícito e informado
**Estado**: ⚠️  Parcialmente implementado
- ✅ Consentimiento es explícito (requiere acción)
- ⚠️  Falta registrar rechazo explícito
- ⚠️  Falta diferenciar "no dado" vs "rechazado"

#### ✅ Art. 7.3 - Derecho a retirar el consentimiento
**Estado**: ✅ Implementado
- Endpoint `POST /api/consents/revoke` disponible
- Registra revocación en audit logs

#### ⚠️  Art. 5.2 - Responsabilidad proactiva
**Estado**: ⚠️  Parcialmente implementado
- ✅ Podemos demostrar consentimientos otorgados
- ❌ NO podemos demostrar rechazos explícitos

---

## 🎯 Roadmap de Mejoras

### Fase 1: Correcciones Críticas (Alta prioridad)
- [ ] Cambiar HTTP 500 → 400 en rechazo de consentimiento
- [ ] Implementar `DenyConsentCommand`
- [ ] Registrar rechazos en MongoDB (`status: "denied"`)

### Fase 2: Navegación Limitada (Media prioridad)
- [ ] Crear visitantes anónimos en rechazo
- [ ] Implementar modo "solo lectura"
- [ ] Frontend: deshabilitar funciones según estado de consentimiento

### Fase 3: Mejoras UX (Baja prioridad)
- [ ] Banner persistente para decisión pendiente
- [ ] Recordar decisión en localStorage
- [ ] Permitir cambiar decisión desde configuración

---

## 🔗 Referencias

- [RGPD - Texto Completo](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [FRONTEND_CONSENT_INTEGRATION.md](./FRONTEND_CONSENT_INTEGRATION.md)
- [CONSENT_AUTH_GUIDE.md](./CONSENT_AUTH_GUIDE.md)
- [SDK_CONSENT_API.md](./SDK_CONSENT_API.md)

---

**Última actualización**: Octubre 2025
**Versión**: 1.0.0
