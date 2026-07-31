# Sistema de Gestión de Consentimientos RGPD

## Descripción General

Sistema completo de gestión de consentimientos conforme al Reglamento General de Protección de Datos (RGPD) que permite a los visitantes gestionar sus preferencias de privacidad y a la plataforma mantener un registro completo y auditable de todas las acciones relacionadas con consentimientos.

## Características Principales

### ✅ Cumplimiento RGPD Completo

- **Art. 7.1**: Demostración de consentimiento válido
- **Art. 7.3**: Derecho a retirar el consentimiento fácilmente
- **Art. 15**: Derecho de acceso del interesado
- **Art. 5.2**: Responsabilidad proactiva
- **Art. 30**: Registro completo de actividades de tratamiento

### 🔐 Funcionalidades Implementadas

1. **Revocación de Consentimientos**
   - Permite a los visitantes retirar consentimientos en cualquier momento
   - Registro de razón de revocación
   - Inmediato cese del procesamiento de datos

2. **Renovación de Consentimientos**
   - Extensión de fechas de expiración
   - Validaciones de negocio robustas
   - Notificaciones proactivas de próxima expiración

3. **Historial Completo**
   - Acceso a todos los consentimientos del visitante
   - Información detallada de cada consentimiento
   - Filtrado por estado y tipo

4. **Audit Log Completo**
   - Registro inmutable de todas las acciones
   - Trazabilidad completa (IP, User Agent, timestamps)
   - Metadata adicional para contexto

5. **Detección Automática de Expiraciones**
   - Cron job semanal para detectar consentimientos próximos a expirar
   - Sistema configurable de notificaciones
   - Logging para monitoreo y alertas

## Arquitectura

### Principios de Diseño

- **Domain-Driven Design (DDD)**: Lógica de negocio encapsulada en agregados
- **CQRS**: Separación clara entre comandos (write) y queries (read)
- **Event Sourcing**: Todos los cambios emiten eventos de dominio
- **Result Pattern**: Manejo de errores sin excepciones en flujo de negocio

### Componentes Principales

```
src/context/consent/
├── domain/                          # Lógica de negocio
│   ├── visitor-consent.aggregate.ts # Agregado principal
│   ├── consent-audit-log.aggregate.ts
│   ├── events/                      # Eventos de dominio
│   │   ├── consent-granted.event.ts
│   │   ├── consent-revoked.event.ts
│   │   ├── consent-expired.event.ts
│   │   └── consent-renewed.event.ts
│   └── value-objects/               # Objetos de valor
│       ├── consent-type.ts
│       ├── consent-status.ts
│       ├── consent-version.ts
│       └── audit-action-type.ts
│
├── application/                     # Casos de uso
│   ├── commands/                    # Comandos (write)
│   │   ├── revoke-consent.command.ts
│   │   └── renew-consent.command.ts
│   ├── queries/                     # Consultas (read)
│   │   ├── get-visitor-consent-history.query.ts
│   │   └── get-visitor-audit-logs.query.ts
│   ├── events/                      # Event handlers
│   │   ├── log-consent-granted-event.handler.ts
│   │   ├── log-consent-revoked-event.handler.ts
│   │   ├── log-consent-expired-event.handler.ts
│   │   └── log-consent-renewed-event.handler.ts
│   └── services/                    # Servicios de aplicación
│       ├── consent-expiration.service.ts
│       └── check-expiring-consents.service.ts
│
└── infrastructure/                  # Adaptadores externos
    ├── controllers/
    │   └── consent.controller.ts    # API REST
    └── persistence/
        ├── entity/
        │   ├── visitor-consent-mongo.entity.ts
        │   └── consent-audit-log-mongo.entity.ts
        └── impl/
            ├── mongo-consent.repository.impl.ts
            └── mongo-consent-audit-log.repository.impl.ts
```

## Tipos de Consentimiento

| Tipo | Código | Descripción | Requerido |
|------|--------|-------------|-----------|
| Política de Privacidad | `privacy_policy` | Consentimiento base para procesamiento de datos | ✅ Sí |
| Marketing | `marketing` | Comunicaciones comerciales y promocionales | ❌ No |
| Analytics | `analytics` | Análisis de comportamiento y métricas | ❌ No |

## Estados de Consentimiento

| Estado | Descripción | Puede procesar datos |
|--------|-------------|---------------------|
| `granted` | Otorgado y vigente | ✅ Sí |
| `revoked` | Revocado por el usuario | ❌ No |
| `expired` | Expirado por tiempo | ❌ No |

## Endpoints API

### Base URL
```
https://api.tudominio.com/consents
```

### Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/revoke` | Revocar un consentimiento |
| `POST` | `/renew` | Renovar un consentimiento |
| `GET` | `/visitors/:visitorId` | Obtener historial de consentimientos |
| `GET` | `/visitors/:visitorId/audit-logs` | Obtener audit logs |

Para documentación detallada de cada endpoint, consulta [SDK_CONSENT_API.md](./SDK_CONSENT_API.md)

## Ejemplos de Integración

### Widget de Cookies Básico

```typescript
import { ConsentWidget } from './consent-widget';

const widget = new ConsentWidget({
  visitorId: 'visitor-uuid',
  apiUrl: 'https://api.tudominio.com',
  token: 'visitor-token'
});

widget.initialize();
```

### React Hook Personalizado

```typescript
import { useConsents } from './hooks/useConsents';

function MyComponent() {
  const { consents, loading, revokeConsent, renewConsent } = useConsents(visitorId);

  if (loading) return <Loading />;

  return (
    <ConsentManager
      consents={consents}
      onRevoke={revokeConsent}
      onRenew={renewConsent}
    />
  );
}
```

Para ejemplos completos de integración, consulta [CONSENT_INTEGRATION_EXAMPLES.md](./CONSENT_INTEGRATION_EXAMPLES.md)

## Configuración de Cron Jobs

### Expiración Automática
```
Frecuencia: Diaria a las 02:00 UTC
Acción: Marca consentimientos vencidos como 'expired'
Handler: ConsentExpirationService
```

### Detección de Próxima Expiración
```
Frecuencia: Semanal (lunes a las 09:00 UTC)
Acción: Detecta consentimientos que expiran en 30 días
Handler: CheckExpiringConsentsService
Umbral: 30 días (configurable)
```

## Seguridad y Autenticación

### Guards Implementados

- **DualAuthGuard**: Acepta JWT Bearer Token o Session Cookies
- **RolesGuard**: Valida roles del usuario

### Roles Permitidos

- `visitor`: Visitante autenticado (solo puede gestionar sus propios consentimientos)
- `commercial`: Usuario comercial (puede ver consentimientos de visitantes asignados)
- `admin`: Administrador (acceso completo)

## Testing

### Cobertura de Tests

```
Domain (Aggregate):      8 tests unitarios   ✅
Command Handlers:        7 tests unitarios   ✅
E2E:                    13 tests integración ✅
Total:                  28 tests             ✅
Cobertura:              100% lógica crítica  ✅
```

### Ejecutar Tests

```bash
# Tests unitarios
npm run test:unit -- src/context/consent

# Tests E2E
npm run test:e2e -- test/consent.e2e-spec.ts

# Todos los tests con cobertura
npm run test:unit -- src/context/consent --coverage
```

## Monitoreo y Logs

### Eventos Importantes

```typescript
// Logs estructurados
Logger.log(`Consentimiento revocado: visitorId=${visitorId}, type=${type}`);
Logger.log(`Consentimiento renovado: visitorId=${visitorId}, type=${type}`);
Logger.log(`[CRON] Encontrados ${count} consentimientos expirados`);
Logger.log(`[CRON] Encontrados ${count} consentimientos próximos a expirar`);
```

### Métricas Recomendadas

- Número total de consentimientos activos por tipo
- Tasa de revocación por tipo de consentimiento
- Tiempo promedio hasta revocación
- Consentimientos próximos a expirar
- Tasa de renovación de consentimientos

## Roadmap Futuro

### Fase 6: Notificaciones por Email (Opcional)

- [ ] Servicio de envío de emails
- [ ] Templates para notificaciones de expiración
- [ ] Configuración de preferencias de notificación
- [ ] Integración con SendGrid/AWS SES

### Fase 7: Dashboard de Métricas (Opcional)

- [ ] Panel de visualización de consentimientos
- [ ] Gráficos de tendencias
- [ ] Alertas configurables
- [ ] Export de datos para compliance

### Fase 8: Optimizaciones (Opcional)

- [ ] Caché de consentimientos activos
- [ ] Índices optimizados en MongoDB
- [ ] Paginación en queries de historial
- [ ] Compresión de audit logs antiguos

## Soporte y Contribución

### Documentación

- [API Reference](./SDK_CONSENT_API.md) - Documentación completa de la API
- [Integration Examples](./CONSENT_INTEGRATION_EXAMPLES.md) - Ejemplos de código
- [Version Management](./CONSENT_VERSION_MANAGEMENT.md) - Gestión de versiones de consentimiento
- [GitHub Secrets Setup](./GITHUB_SECRETS_CONSENT_VERSION.md) - Configuración de versiones por entorno
- [Architecture](../CLAUDE.md) - Guía de arquitectura del proyecto

### Contacto

- **Equipo**: Backend Team
- **Email**: dev@tudominio.com
- **Issues**: GitHub Issues

## Licencia

Propiedad de [Tu Empresa]. Todos los derechos reservados.

---

**Versión**: 1.0.0
**Última actualización**: Octubre 2025
**Status**: ✅ Producción Ready
