# API de Gestión de Consentimientos - SDK para Visitantes

## Índice

1. [Introducción](#introducción)
2. [Cumplimiento RGPD](#cumplimiento-rgpd)
3. [Tipos de Consentimiento](#tipos-de-consentimiento)
4. [Endpoints Disponibles](#endpoints-disponibles)
5. [Ejemplos de Uso](#ejemplos-de-uso)
6. [Manejo de Errores](#manejo-de-errores)
7. [Buenas Prácticas](#buenas-prácticas)

---

## Introducción

La API de Gestión de Consentimientos proporciona todas las funcionalidades necesarias para que los visitantes de su sitio web puedan gestionar sus consentimientos de acuerdo con el Reglamento General de Protección de Datos (RGPD).

### URL Base

```
https://api.tudominio.com/consents
```

### Autenticación

Todos los endpoints soportan **autenticación dual**. Puedes autenticarte usando cualquiera de estos métodos:

#### **Método 1: JWT Bearer Token** (recomendado para APIs)
```http
Authorization: Bearer <visitor_token>
```

#### **Método 2: Cookies de sesión**
```http
Cookie: sid=<session-id>
```

O cookies BFF de Keycloak:
```http
Cookie: console_session=<value>; bff_sess=<value>
```

**Nota importante**: Al usar fetch en el navegador, debes incluir `credentials: 'include'` para que las cookies se envíen automáticamente:

```typescript
fetch(url, {
  credentials: 'include', // ← Obligatorio para enviar cookies
});
```

**Roles permitidos**: `visitor`, `commercial`, `admin`

**Para más detalles sobre autenticación**, consulta la [Guía de Autenticación](./CONSENT_AUTH_GUIDE.md)

---

## Cumplimiento RGPD

Esta API implementa los siguientes artículos del RGPD:

- **Art. 7.1**: Demostrar que el interesado consintió el tratamiento
- **Art. 7.3**: Derecho a retirar el consentimiento en cualquier momento
- **Art. 15**: Derecho de acceso del interesado
- **Art. 5.2**: Responsabilidad proactiva (notificaciones de expiración)
- **Art. 30**: Registro de las actividades de tratamiento (audit logs)

---

## Tipos de Consentimiento

### Tipos Disponibles

| Tipo | Descripción | Requerido |
|------|-------------|-----------|
| `privacy_policy` | Política de Privacidad | ✅ Sí |
| `marketing` | Comunicaciones de Marketing | ❌ No |
| `analytics` | Análisis y Estadísticas | ❌ No |

### Estados de Consentimiento

| Estado | Descripción |
|--------|-------------|
| `granted` | Consentimiento otorgado y vigente |
| `revoked` | Consentimiento revocado por el usuario |
| `expired` | Consentimiento expirado por tiempo |

---

## Endpoints Disponibles

### 1. Revocar Consentimiento

Permite a un visitante retirar un consentimiento previamente otorgado.

**RGPD**: Art. 7.3 - Derecho a retirar el consentimiento

```http
POST /consents/revoke
```

#### Request Body

```typescript
{
  "visitorId": string,      // UUID del visitante
  "consentType": string,    // privacy_policy | marketing | analytics
  "reason"?: string         // Opcional: razón de la revocación
}
```

#### Response

```typescript
{
  "message": "Consentimiento revocado exitosamente"
}
```

#### Códigos de Estado

- `200 OK` - Consentimiento revocado exitosamente
- `400 Bad Request` - Datos inválidos
- `404 Not Found` - Consentimiento no encontrado
- `401 Unauthorized` - Token inválido o expirado

---

### 2. Renovar Consentimiento

Extiende la fecha de expiración de un consentimiento activo.

**RGPD**: Art. 7.1 - Mantener registro actualizado del consentimiento

```http
POST /consents/renew
```

#### Request Body

```typescript
{
  "visitorId": string,        // UUID del visitante
  "consentType": string,      // privacy_policy | marketing | analytics
  "newExpiresAt": string      // Fecha ISO 8601: "2026-12-31T23:59:59.999Z"
}
```

#### Response

```typescript
{
  "message": "Consentimiento renovado exitosamente"
}
```

#### Validaciones

- ❌ No se puede renovar un consentimiento revocado
- ❌ No se puede renovar un consentimiento expirado
- ❌ La nueva fecha debe ser futura
- ✅ Solo se renuevan consentimientos en estado `granted`

#### Códigos de Estado

- `200 OK` - Consentimiento renovado exitosamente
- `400 Bad Request` - Datos inválidos o consentimiento no renovable
- `404 Not Found` - Consentimiento no encontrado
- `401 Unauthorized` - Token inválido o expirado

---

### 3. Obtener Historial de Consentimientos

Recupera todos los consentimientos de un visitante.

**RGPD**: Art. 15 - Derecho de acceso del interesado

```http
GET /consents/visitors/:visitorId
```

#### Parámetros

- `visitorId` (path): UUID del visitante

#### Response

```typescript
{
  "consents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "visitorId": "550e8400-e29b-41d4-a716-446655440002",
      "consentType": "privacy_policy",
      "status": "granted",
      "version": "v1.4.0",
      "grantedAt": "2025-01-10T10:30:00.000Z",
      "revokedAt": null,
      "expiresAt": "2026-01-10T10:30:00.000Z",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "metadata": {
        "source": "web",
        "campaign": "summer2025"
      },
      "createdAt": "2025-01-10T10:30:00.000Z",
      "updatedAt": "2025-01-10T10:30:00.000Z"
    }
  ],
  "total": 3
}
```

#### Códigos de Estado

- `200 OK` - Historial obtenido exitosamente
- `400 Bad Request` - ID de visitante inválido
- `401 Unauthorized` - Token inválido o expirado

---

### 4. Obtener Audit Logs

Recupera el registro completo de auditoría de todas las acciones sobre consentimientos.

**RGPD**: Art. 5.2 y Art. 30 - Responsabilidad proactiva y registro de actividades

```http
GET /consents/visitors/:visitorId/audit-logs
```

#### Parámetros

- `visitorId` (path): UUID del visitante

#### Response

```typescript
{
  "auditLogs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "consentId": "550e8400-e29b-41d4-a716-446655440001",
      "visitorId": "550e8400-e29b-41d4-a716-446655440002",
      "actionType": "consent_granted",  // consent_granted | consent_revoked | consent_expired | consent_renewed
      "consentType": "privacy_policy",
      "consentVersion": "v1.4.0",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "reason": null,
      "metadata": {
        "renewedAt": "2025-06-15T10:00:00.000Z",
        "newExpiresAt": "2026-12-31T23:59:59.999Z",
        "previousExpiresAt": "2026-01-10T10:30:00.000Z"
      },
      "timestamp": "2025-10-10T10:30:00.000Z"
    }
  ],
  "total": 42
}
```

#### Tipos de Acciones en Audit Log

| Tipo | Descripción |
|------|-------------|
| `consent_granted` | Consentimiento otorgado |
| `consent_revoked` | Consentimiento revocado |
| `consent_expired` | Consentimiento expirado automáticamente |
| `consent_renewed` | Consentimiento renovado |

#### Códigos de Estado

- `200 OK` - Audit logs obtenidos exitosamente
- `400 Bad Request` - ID de visitante inválido
- `401 Unauthorized` - Token inválido o expirado

---

## Ejemplos de Uso

### JavaScript/TypeScript SDK

#### 1. Revocar Consentimiento de Marketing

**Opción A: Con JWT Bearer Token**
```typescript
async function revokeMarketingConsent(visitorId: string) {
  const response = await fetch('https://api.tudominio.com/consents/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${visitorToken}`
    },
    body: JSON.stringify({
      visitorId: visitorId,
      consentType: 'marketing',
      reason: 'El usuario desactivó las comunicaciones comerciales'
    })
  });

  if (!response.ok) {
    throw new Error('Error al revocar consentimiento');
  }

  const data = await response.json();
  console.log(data.message); // "Consentimiento revocado exitosamente"
}
```

**Opción B: Con Cookie de Sesión** (recomendado para widgets frontend)
```typescript
async function revokeMarketingConsent(visitorId: string) {
  const response = await fetch('https://api.tudominio.com/consents/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // ← Importante: envía cookie 'sid' automáticamente
    body: JSON.stringify({
      visitorId: visitorId,
      consentType: 'marketing',
      reason: 'El usuario desactivó las comunicaciones comerciales'
    })
  });

  if (!response.ok) {
    throw new Error('Error al revocar consentimiento');
  }

  const data = await response.json();
  console.log(data.message); // "Consentimiento revocado exitosamente"
}
```

#### 2. Renovar Consentimiento Próximo a Expirar

```typescript
async function renewPrivacyConsent(visitorId: string) {
  // Renovar por 1 año más
  const newExpiresAt = new Date();
  newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

  const response = await fetch('https://api.tudominio.com/consents/renew', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${visitorToken}`
    },
    body: JSON.stringify({
      visitorId: visitorId,
      consentType: 'privacy_policy',
      newExpiresAt: newExpiresAt.toISOString()
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  const data = await response.json();
  return data;
}
```

#### 3. Verificar Estado de Consentimientos

```typescript
async function checkConsentStatus(visitorId: string) {
  const response = await fetch(
    `https://api.tudominio.com/consents/visitors/${visitorId}`,
    {
      headers: {
        'Authorization': `Bearer ${visitorToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error('Error al obtener historial');
  }

  const data = await response.json();

  // Verificar consentimientos activos
  const activeConsents = data.consents.filter(
    c => c.status === 'granted' && (!c.expiresAt || new Date(c.expiresAt) > new Date())
  );

  return {
    hasPrivacyPolicy: activeConsents.some(c => c.consentType === 'privacy_policy'),
    hasMarketing: activeConsents.some(c => c.consentType === 'marketing'),
    hasAnalytics: activeConsents.some(c => c.consentType === 'analytics'),
    total: data.total,
    activeCount: activeConsents.length
  };
}
```

#### 4. Detectar Consentimientos Próximos a Expirar

```typescript
async function checkExpiringConsents(visitorId: string, daysBeforeExpiration = 30) {
  const response = await fetch(
    `https://api.tudominio.com/consents/visitors/${visitorId}`,
    {
      headers: {
        'Authorization': `Bearer ${visitorToken}`
      }
    }
  );

  const data = await response.json();
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysBeforeExpiration);

  const expiringConsents = data.consents.filter(consent => {
    if (!consent.expiresAt || consent.status !== 'granted') return false;

    const expiresAt = new Date(consent.expiresAt);
    return expiresAt > now && expiresAt <= futureDate;
  });

  return expiringConsents;
}

// Uso
const expiring = await checkExpiringConsents(visitorId, 30);
if (expiring.length > 0) {
  console.log(`Tienes ${expiring.length} consentimientos próximos a expirar`);
  // Mostrar notificación al usuario
}
```

#### 5. Visualizar Historial de Auditoría

```typescript
async function getConsentAuditTrail(visitorId: string) {
  const response = await fetch(
    `https://api.tudominio.com/consents/visitors/${visitorId}/audit-logs`,
    {
      headers: {
        'Authorization': `Bearer ${visitorToken}`
      }
    }
  );

  const data = await response.json();

  // Agrupar por tipo de acción
  const summary = data.auditLogs.reduce((acc, log) => {
    acc[log.actionType] = (acc[log.actionType] || 0) + 1;
    return acc;
  }, {});

  return {
    logs: data.auditLogs,
    total: data.total,
    summary: summary
  };
}

// Ejemplo de salida:
// {
//   logs: [...],
//   total: 15,
//   summary: {
//     consent_granted: 5,
//     consent_renewed: 8,
//     consent_revoked: 2
//   }
// }
```

---

## Manejo de Errores

### Estructura de Error

```typescript
{
  "statusCode": 400,
  "message": "Tipo de consentimiento inválido: invalid_type. Tipos válidos: privacy_policy, marketing, analytics",
  "error": "Bad Request"
}
```

### Errores Comunes

#### 400 Bad Request

```typescript
// Tipo de consentimiento inválido
{
  "statusCode": 400,
  "message": "Tipo de consentimiento inválido: marketing_emails. Tipos válidos: privacy_policy, marketing, analytics"
}

// Fecha de expiración inválida
{
  "statusCode": 400,
  "message": "La nueva fecha de expiración debe ser posterior a la fecha actual"
}

// Consentimiento no renovable
{
  "statusCode": 400,
  "message": "No se puede renovar un consentimiento revocado. Debe otorgarse un nuevo consentimiento."
}
```

#### 404 Not Found

```typescript
{
  "statusCode": 404,
  "message": "No se encontró consentimiento para visitante 550e8400-e29b-41d4-a716-446655440002 del tipo privacy_policy"
}
```

#### 401 Unauthorized

```typescript
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### Ejemplo de Manejo de Errores

```typescript
async function safeRevokeConsent(visitorId: string, consentType: string) {
  try {
    const response = await fetch('https://api.tudominio.com/consents/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${visitorToken}`
      },
      body: JSON.stringify({ visitorId, consentType })
    });

    if (!response.ok) {
      const error = await response.json();

      switch (response.status) {
        case 400:
          console.error('Datos inválidos:', error.message);
          break;
        case 404:
          console.error('Consentimiento no encontrado:', error.message);
          break;
        case 401:
          console.error('No autorizado. Token inválido o expirado.');
          // Redirigir a login
          break;
        default:
          console.error('Error desconocido:', error);
      }

      return { success: false, error: error.message };
    }

    const data = await response.json();
    return { success: true, data };

  } catch (error) {
    console.error('Error de red:', error);
    return { success: false, error: 'Error de conexión' };
  }
}
```

---

## Buenas Prácticas

### 1. Verificación de Estado antes de Acciones

Siempre verifica el estado actual del consentimiento antes de intentar revocarlo o renovarlo:

```typescript
async function smartRevokeConsent(visitorId: string, consentType: string) {
  // 1. Obtener estado actual
  const history = await getConsentHistory(visitorId);
  const activeConsent = history.consents.find(
    c => c.consentType === consentType && c.status === 'granted'
  );

  // 2. Validar que existe y está activo
  if (!activeConsent) {
    console.warn('No hay consentimiento activo para revocar');
    return { success: false, reason: 'no_active_consent' };
  }

  // 3. Proceder con la revocación
  return await revokeConsent(visitorId, consentType);
}
```

### 2. Notificaciones Proactivas de Expiración

Implementa un sistema de notificaciones para alertar a los usuarios sobre consentimientos próximos a expirar:

```typescript
// Ejecutar periódicamente (ej: cada semana)
async function checkAndNotifyExpiring(visitorId: string) {
  const expiring = await checkExpiringConsents(visitorId, 30);

  for (const consent of expiring) {
    const daysRemaining = Math.ceil(
      (new Date(consent.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
    );

    // Mostrar notificación al usuario
    showNotification({
      type: 'warning',
      title: 'Consentimiento próximo a expirar',
      message: `Tu consentimiento de ${consent.consentType} expirará en ${daysRemaining} días`,
      action: {
        label: 'Renovar ahora',
        onClick: () => renewConsent(visitorId, consent.consentType)
      }
    });
  }
}
```

### 3. Caché Local de Consentimientos

Para mejorar el rendimiento, mantén una caché local de los consentimientos activos:

```typescript
class ConsentCache {
  private cache = new Map();
  private TTL = 5 * 60 * 1000; // 5 minutos

  async getActiveConsents(visitorId: string) {
    const cached = this.cache.get(visitorId);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }

    const data = await checkConsentStatus(visitorId);
    this.cache.set(visitorId, { data, timestamp: Date.now() });

    return data;
  }

  invalidate(visitorId: string) {
    this.cache.delete(visitorId);
  }
}

// Uso
const cache = new ConsentCache();

// Obtener (desde caché si es reciente)
const status = await cache.getActiveConsents(visitorId);

// Invalidar después de modificar
await revokeConsent(visitorId, 'marketing');
cache.invalidate(visitorId);
```

### 4. Tracking de Eventos de Consentimiento

Registra todos los eventos de consentimiento para análisis y cumplimiento:

```typescript
// Wrapper que registra eventos
async function trackConsentAction(action: string, details: any) {
  // Registrar en analytics
  analytics.track('Consent Action', {
    action,
    timestamp: new Date().toISOString(),
    ...details
  });

  // Ejecutar la acción real
  let result;
  switch (action) {
    case 'revoke':
      result = await revokeConsent(details.visitorId, details.consentType);
      break;
    case 'renew':
      result = await renewConsent(details.visitorId, details.consentType);
      break;
  }

  // Registrar resultado
  analytics.track('Consent Action Result', {
    action,
    success: result.success,
    timestamp: new Date().toISOString()
  });

  return result;
}
```

### 5. UI/UX Recomendaciones

```typescript
// Componente de ejemplo para gestión de consentimientos
interface ConsentManagerProps {
  visitorId: string;
}

function ConsentManager({ visitorId }: ConsentManagerProps) {
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConsents() {
      const history = await getConsentHistory(visitorId);
      setConsents(history.consents);
      setLoading(false);
    }
    loadConsents();
  }, [visitorId]);

  const handleRevoke = async (consentType: string) => {
    const confirmed = await showConfirmDialog({
      title: '¿Revocar consentimiento?',
      message: 'Esta acción es irreversible. Tendrás que otorgar un nuevo consentimiento si cambias de opinión.',
      confirmText: 'Sí, revocar',
      cancelText: 'Cancelar'
    });

    if (confirmed) {
      await revokeConsent(visitorId, consentType);
      // Recargar
      const updated = await getConsentHistory(visitorId);
      setConsents(updated.consents);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="consent-manager">
      {consents.map(consent => (
        <ConsentCard
          key={consent.id}
          consent={consent}
          onRevoke={() => handleRevoke(consent.consentType)}
          onRenew={() => handleRenew(visitorId, consent.consentType)}
        />
      ))}
    </div>
  );
}
```

---

## Versionado de Consentimientos y SemVer

### Versión Actual del Sistema

**Versión mínima requerida**: `v1.4.0`

El sistema utiliza **Compatibilidad Semántica de Versiones (SemVer)** para gestionar las versiones de consentimiento de manera flexible.

### ¿Cómo Funciona SemVer?

El formato de versión sigue el estándar SemVer: `vMAJOR.MINOR.PATCH[-prerelease]`

Ejemplo: `v1.4.0`, `v1.5.2`, `v2.0.0-beta.1`

#### Reglas de Compatibilidad

Cuando el backend requiere `v1.4.0`:

| Versión Enviada | ¿Aceptada? | Razón |
|----------------|-----------|-------|
| `v1.4.0` | ✅ Sí | Versión exacta |
| `v1.4.1` | ✅ Sí | PATCH mayor (compatible) |
| `v1.5.0` | ✅ Sí | MINOR mayor (compatible) |
| `v1.6.2` | ✅ Sí | MINOR y PATCH mayores |
| `v2.0.0` | ❌ No | MAJOR diferente (breaking change) |
| `v1.3.9` | ❌ No | MINOR menor (obsoleta) |
| `v1.0.0` | ❌ No | MINOR menor (obsoleta) |

### Configuración del Sistema

- **SemVer habilitado por defecto**: `ENABLE_SEMVER_COMPATIBILITY=true`
- **Versión por defecto del backend**: `v1.4.0`

### Mejores Prácticas para Desarrolladores

#### ✅ Recomendado: Omitir la versión

Deja que el backend use su versión actual automáticamente:

```typescript
// ✅ MEJOR PRÁCTICA: El backend usará v1.4.0
const response = await fetch('/api/visitors/identify', {
  method: 'POST',
  body: JSON.stringify({
    fingerprint: 'fp_123',
    domain: 'example.com',
    apiKey: 'YOUR_API_KEY',
    hasAcceptedPrivacyPolicy: true,
    // NO especificar consentVersion
  })
});
```

#### ⚠️ Alternativa: Especificar versión igual o superior

Si necesitas especificar la versión:

```typescript
// ⚠️ ALTERNATIVA: Especificar versión manualmente
const response = await fetch('/api/visitors/identify', {
  method: 'POST',
  body: JSON.stringify({
    fingerprint: 'fp_123',
    domain: 'example.com',
    apiKey: 'YOUR_API_KEY',
    hasAcceptedPrivacyPolicy: true,
    consentVersion: '1.4.0', // o '1.5.0', '1.4.1', etc.
  })
});
```

#### ❌ Evitar: Versiones obsoletas

No uses versiones antiguas:

```typescript
// ❌ MAL: Esto FALLARÁ
const response = await fetch('/api/visitors/identify', {
  method: 'POST',
  body: JSON.stringify({
    fingerprint: 'fp_123',
    domain: 'example.com',
    apiKey: 'YOUR_API_KEY',
    hasAcceptedPrivacyPolicy: true,
    consentVersion: '1.0.0', // ← ERROR: v1.0.0 < v1.4.0
  })
});

// Error response:
// {
//   "statusCode": 400,
//   "message": "Versión de consentimiento obsoleta: v1.0.0. Backend requiere versión mínima v1.4.0"
// }
```

### Normalización Automática

El backend normaliza automáticamente las versiones:

```typescript
// Todas estas formas son equivalentes:
'1.4.0'         → 'v1.4.0'  ✅
'v1.4.0'        → 'v1.4.0'  ✅
'1.5.2-beta.1'  → 'v1.5.2-beta.1'  ✅
```

### Beneficios de SemVer

1. **Flexibilidad**: Los frontends pueden usar versiones superiores sin romper compatibilidad
2. **Mantenibilidad**: Permite evolucionar políticas de privacidad sin forzar actualizaciones inmediatas
3. **Claridad**: Indica claramente cambios menores (PATCH, MINOR) vs cambios mayores (MAJOR)
4. **Cumplimiento RGPD**: Mantiene registro histórico de qué versión aceptó cada usuario

---

## Recursos Adicionales

### Enlaces Útiles

- [RGPD - Texto oficial](https://gdpr-info.eu/)
- [Guía de cumplimiento RGPD](https://www.aepd.es/es/guias)
- [Semantic Versioning Specification](https://semver.org/)
- [Guía de Integración Frontend](./FRONTEND_CONSENT_INTEGRATION.md)
- [Documentación SemVer del Sistema](./CONSENT_SEMVER_COMPATIBILITY.md)

### Soporte

Para soporte técnico o preguntas sobre la API:
- Email: dev@tudominio.com
- Documentación completa: https://docs.tudominio.com

---

**Versión**: 2.0.0
**Última actualización**: Enero 2025
**Mantenido por**: Equipo de Backend
