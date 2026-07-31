# Guía de Autenticación - API de Consentimientos RGPD

## Descripción General

Los endpoints de consentimientos (`/api/consents/*`) soportan **autenticación dual**, lo que significa que puedes autenticarte usando cualquiera de estos tres métodos:

1. ✅ **JWT Bearer Token** (recomendado para APIs externas)
2. ✅ **Cookies de sesión BFF de Keycloak** (para usuarios comerciales/admin desde la consola web)
3. ✅ **Cookie de sesión de visitante V2** (para visitantes desde el widget frontend)

---

## Métodos de Autenticación

### 1. JWT Bearer Token

**Uso**: APIs externas, aplicaciones móviles, servicios backend-to-backend

```bash
curl -X GET \
  http://localhost:3000/api/consents/visitors/4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Formato del Header**:
```
Authorization: Bearer <token>
```

**¿Cómo obtener el token?**
- Hacer login en `/api/auth/login` (para usuarios comerciales/admin)
- El token se obtiene en el campo `accessToken` de la respuesta

**Ejemplo en JavaScript**:
```typescript
const response = await fetch(
  'http://localhost:3000/api/consents/visitors/4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  }
);
```

---

### 2. Cookies de Sesión BFF (Keycloak)

**Uso**: Aplicaciones web conectadas a Keycloak (consola de administración, panel de usuarios comerciales)

```bash
curl -X GET \
  http://localhost:3000/api/consents/visitors/4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be \
  -H "Cookie: console_session=abc123; bff_sess=xyz789" \
  --cookie-jar cookies.txt
```

**Cookies reconocidas**:
- `console_session`
- `bff_sess`
- `keycloak_session`
- Cualquier cookie que contenga tokens JWT válidos de Keycloak

**Formato del Header**:
```
Cookie: console_session=<valor>; bff_sess=<valor>
```

**¿Cómo se obtienen estas cookies?**
- Se establecen automáticamente al hacer login a través del BFF de Keycloak
- El navegador las envía automáticamente en las peticiones

**Ejemplo en JavaScript (navegador)**:
```typescript
// Las cookies se envían automáticamente si la aplicación está en el mismo dominio
const response = await fetch(
  'http://localhost:3000/api/consents/visitors/4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be',
  {
    credentials: 'include', // Importante: envía cookies automáticamente
  }
);
```

---

### 3. Cookie de Sesión de Visitante V2 (SID)

**Uso**: Visitantes anónimos o identificados desde el widget frontend

```bash
curl -X GET \
  http://localhost:3000/api/consents/visitors/4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be \
  -H "Cookie: sid=9f7a3b2e-4c1d-4a8e-9f2b-3c4d5e6f7a8b"
```

**Cookie reconocida**:
- `sid` - ID de sesión del visitante V2

**Formato del Header**:
```
Cookie: sid=<session-id>
```

**¿Cómo se obtiene esta cookie?**
- Se establece automáticamente al llamar a `/api/visitors/identify` desde el widget frontend
- El backend devuelve `Set-Cookie: sid=<session-id>` en la respuesta
- El navegador la envía automáticamente en peticiones subsecuentes

**Ejemplo en JavaScript (widget frontend)**:
```typescript
// 1. Identificar visitante (establece la cookie 'sid')
const identifyResponse = await fetch('http://localhost:3000/api/visitors/identify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // IMPORTANTE: permite que el backend establezca cookies
  body: JSON.stringify({
    domain: 'example.com',
    apiKey: 'your-api-key',
    hasAcceptedPrivacyPolicy: true,
    fingerprint: 'abc123',
    currentUrl: window.location.href,
  }),
});

// 2. Obtener consentimientos (la cookie 'sid' se envía automáticamente)
const consentsResponse = await fetch(
  `http://localhost:3000/api/consents/visitors/${visitorId}`,
  {
    credentials: 'include', // Envía la cookie 'sid' automáticamente
  }
);

const data = await consentsResponse.json();
console.log('Consentimientos:', data.consents);
```

---

## Prioridad de Autenticación

El sistema intenta autenticar en este orden:

1. **JWT Bearer Token** (si presente)
2. **Cookies BFF de Keycloak** (si presentes)
3. **Cookie de sesión de visitante** (si presente)

Si **ninguno** de estos métodos es válido, recibirás un error **401 Unauthorized**:

```json
{
  "message": "Se requiere autenticación válida (JWT Bearer token o cookie de sesión)",
  "error": "Unauthorized",
  "statusCode": 401
}
```

---

## Endpoints Disponibles

Todos estos endpoints soportan autenticación dual:

### **GET** `/api/consents/visitors/:visitorId`
Obtiene el historial completo de consentimientos de un visitante.

**Roles permitidos**: `visitor`, `commercial`, `admin`

**Ejemplo de respuesta**:
```json
{
  "consents": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "visitorId": "4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be",
      "consentType": "privacy_policy",
      "status": "granted",
      "version": "v1.0.0",
      "grantedAt": "2025-01-01T00:00:00.000Z",
      "expiresAt": "2026-01-01T00:00:00.000Z",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    }
  ],
  "total": 1
}
```

---

### **GET** `/api/consents/visitors/:visitorId/audit-logs`
Obtiene todos los registros de auditoría de consentimientos.

**Roles permitidos**: `visitor`, `commercial`, `admin`

**Ejemplo de respuesta**:
```json
{
  "auditLogs": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "consentId": "11111111-1111-4111-8111-111111111111",
      "visitorId": "4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be",
      "actionType": "consent_granted",
      "consentType": "privacy_policy",
      "timestamp": "2025-01-01T00:00:00.000Z",
      "ipAddress": "192.168.1.1"
    }
  ],
  "total": 1
}
```

---

### **POST** `/api/consents/revoke`
Revoca un consentimiento existente.

**Roles permitidos**: `visitor`, `commercial`, `admin`

**Body**:
```json
{
  "visitorId": "4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be",
  "consentType": "marketing",
  "reason": "Usuario desactivó desde preferencias"
}
```

**Ejemplo con cookie**:
```typescript
await fetch('http://localhost:3000/api/consents/revoke', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Envía cookie 'sid' automáticamente
  body: JSON.stringify({
    visitorId: '4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be',
    consentType: 'marketing',
    reason: 'Usuario desactivó desde preferencias',
  }),
});
```

---

### **POST** `/api/consents/renew`
Renueva un consentimiento extendiendo su fecha de expiración.

**Roles permitidos**: `visitor`, `commercial`, `admin`

**Body**:
```json
{
  "visitorId": "4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be",
  "consentType": "privacy_policy",
  "newExpiresAt": "2027-01-01T00:00:00.000Z"
}
```

**Ejemplo con cookie**:
```typescript
await fetch('http://localhost:3000/api/consents/renew', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Envía cookie 'sid' automáticamente
  body: JSON.stringify({
    visitorId: '4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be',
    consentType: 'privacy_policy',
    newExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // +1 año
  }),
});
```

---

## Troubleshooting

### Error 401: "Se requiere autenticación válida"

**Causas comunes**:
1. No se envió ningún método de autenticación (ni Bearer token ni cookies)
2. El token JWT ha expirado
3. La cookie de sesión ha expirado o es inválida
4. Falta el header `credentials: 'include'` en fetch

**Solución**:
```typescript
// ✅ Correcto
fetch(url, {
  credentials: 'include', // IMPORTANTE
});

// ❌ Incorrecto
fetch(url); // No envía cookies
```

---

### Error 403: "No tienes permisos"

**Causa**: El usuario autenticado no tiene el rol necesario para el endpoint.

**Solución**: Verifica que el usuario tenga uno de los roles permitidos: `visitor`, `commercial`, o `admin`.

---

### Cookie no se envía automáticamente

**Causa**: Configuración CORS incorrecta o falta `credentials: 'include'`.

**Solución**:
```typescript
// Frontend
fetch(url, {
  credentials: 'include', // ← OBLIGATORIO
});
```

**Backend** (verificar configuración CORS):
```typescript
// main.ts
app.enableCors({
  origin: 'http://localhost:5173', // Tu dominio frontend
  credentials: true, // ← OBLIGATORIO para enviar cookies
});
```

---

## Ejemplos Completos

### Ejemplo 1: Widget Frontend con Cookie de Visitante

```typescript
// widget.ts
class ConsentWidget {
  private apiUrl = 'http://localhost:3000';
  private visitorId: string | null = null;

  async initialize() {
    // 1. Identificar visitante (establece cookie 'sid')
    const response = await fetch(`${this.apiUrl}/api/visitors/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Permite establecer cookie
      body: JSON.stringify({
        domain: window.location.hostname,
        apiKey: 'your-api-key',
        hasAcceptedPrivacyPolicy: true,
        fingerprint: await this.generateFingerprint(),
        currentUrl: window.location.href,
      }),
    });

    const data = await response.json();
    this.visitorId = data.id;
    console.log('✅ Visitante identificado:', this.visitorId);
  }

  async getConsents() {
    if (!this.visitorId) {
      throw new Error('Visitante no identificado');
    }

    // 2. Obtener consentimientos (cookie 'sid' se envía automáticamente)
    const response = await fetch(
      `${this.apiUrl}/api/consents/visitors/${this.visitorId}`,
      {
        credentials: 'include', // Envía cookie 'sid'
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.consents;
  }

  async revokeConsent(consentType: string) {
    await fetch(`${this.apiUrl}/api/consents/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Envía cookie 'sid'
      body: JSON.stringify({
        visitorId: this.visitorId,
        consentType,
        reason: 'Usuario desactivó desde widget',
      }),
    });
  }

  private async generateFingerprint(): Promise<string> {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
    ];
    const str = components.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// Uso
const widget = new ConsentWidget();
await widget.initialize();
const consents = await widget.getConsents();
console.log('Consentimientos:', consents);
```

---

### Ejemplo 2: Aplicación Admin con JWT

```typescript
// admin-panel.ts
class ConsentManager {
  private apiUrl = 'http://localhost:3000';
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async getVisitorConsents(visitorId: string) {
    const response = await fetch(
      `${this.apiUrl}/api/consents/visitors/${visitorId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  async revokeConsent(visitorId: string, consentType: string) {
    const response = await fetch(`${this.apiUrl}/api/consents/revoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        visitorId,
        consentType,
        reason: 'Revocado por administrador',
      }),
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }
}

// Uso
const manager = new ConsentManager('eyJhbGciOiJIUzI1NiIs...');
const consents = await manager.getVisitorConsents('4bb44f8d-0e2d-4d5a-8836-8e11f50fb1be');
console.log('Consentimientos:', consents);
```

---

## Referencias

- [Documentación completa de la API](./SDK_CONSENT_API.md)
- [Ejemplos de integración frontend](./CONSENT_INTEGRATION_EXAMPLES.md)
- [Guía de arquitectura](../CLAUDE.md)

---

**Última actualización**: Octubre 2025
**Versión**: 1.0.0
