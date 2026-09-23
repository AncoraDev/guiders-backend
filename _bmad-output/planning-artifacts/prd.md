---
stepsCompleted: [1, 2, '2b', '2c', 3, 4, 5, 6-skipped, 7, 8, 9, 10, 11, 12]
inputDocuments:
  - /Users/rogerpugaruiz/Proyectos/guiders-backend/_bmad-output/brainstorming/brainstorming-session-2026-06-12-1425.md
  - /Users/rogerpugaruiz/Proyectos/guiders-backend/project-context.md
workflowType: 'prd'
documentCounts:
  productBriefs: 0
  research: 0
  brainstorming: 1
  projectDocs: 1
classification:
  projectType: saas_b2b
  domain: general
  complexity: medium
  projectContext: brownfield
---

# Product Requirements Document - guiders-backend

**Feature:** Guiders Embed (white-label B2B)
**Author:** Rogerpugaruiz
**Date:** 2026-06-12

---

## Executive Summary

Guiders Embed habilita white-label del panel admin de Guiders para clientes B2B (LeadCars como cliente inaugural) mediante incrustación iframe cross-domain con branding visual dinámico. El usuario interno del cliente (comercial o admin) accede al panel desde el frontend del propio cliente (ej. `app.leadcars.com`) sin notar cambio de contexto, sin login duplicado, y sin que el cliente deba mantener código de integración.

**Usuarios objetivo:** comerciales y administradores de empresas cliente B2B que ya usan Guiders como backend de chat comercial y necesitan acceso al panel de gestión desde su propio producto, no desde `admin.guiders.es` directo.

**Problema resuelto:** Los clientes B2B que comercializan Guiders como parte de su oferta de valor necesitan presentar la herramienta a sus equipos internos bajo su propia marca. Una redirección a `admin.guiders.es` rompe la inmersión de marca; un SDK o web component añade trabajo de mantenimiento al cliente.

### What Makes This Special

El diferenciador es **responsabilidad técnica 100% en Guiders**. El cliente B2B incrusta un único tag HTML `<iframe src="https://app.guiders.es/embed/start">` y nunca más toca código de integración. El handshake de autenticación se realiza vía `postMessage` entre el parent (cliente) y el iframe (Guiders), eliminando la necesidad de cookies cross-domain, tokens JWT firmados por el cliente, o SDKs que mantener.

El branding visual (colores, logo, tipografía) se aplica dinámicamente vía CSS variables inyectadas en el HTML wrapper, reutilizando el módulo `white-label` existente (`white_label_configs` en MongoDB) sin añadir una nueva capa de configuración. El módulo ya soporta multi-tenant por `companyId`, por lo que el caso de uso es inmediato.

El **core insight** es contraintuitivo: la pregunta "¿qué NO quiere hacer LeadCars?" fue más reveladora que "¿qué necesita LeadCars?". El constraint de "no mantener SDK ni web component" descartó las opciones técnicamente más elegantes y forzó un diseño más simple (iframe + postMessage), que resultó ser más mantenible, más seguro (sin cookies cross-domain) y más fácil de escalar a otros clientes B2B.

### Project Classification

- **Project Type:** saas_b2b — plataforma multi-tenant con modelo RBAC existente (4 roles: `superadmin`, `admin`, `supervisor`, `commercial`)
- **Domain:** general — producto SaaS comercial sin regulated industry
- **Complexity:** medium — multi-tenant estricto, auth entre IdPs distintos, iframe cross-domain, branding dinámico, auditoría
- **Project Context:** brownfield — se añade a `guiders-backend` (NestJS v11 + DDD/CQRS existente)
- **Stack a respetar:** TypeScript ES2021, NestJS v11, MongoDB (Mongoose), Result pattern, CQRS con `@nestjs/cqrs`, eventos con `apply()` + `commit()`, V2 contexts para código nuevo

---

## Success Criteria

### User Success

- **Comercial de LeadCars abre Guiders desde app.leadcars.com** y ve su inbox en menos de 3 segundos, con el logo y colores de LeadCars aplicados. No nota que está en otro producto.
- **Comercial puede responder chats desde el iframe** sin interrupciones durante 8 horas (jornada laboral) sin re-login ni refresh manual.
- **Admin de LeadCars configura el branding** de su empresa (logo, colores, fuente) sin contactar a Guiders, vía el panel `/branding` dentro del admin.
- **Admin de LeadCars gestiona su equipo** (crear/eliminar comerciales, asignar roles) sin salir del contexto LeadCars.

### Business Success

- **Mes 3 (post-launch):** LeadCars activo en producción con los comerciales usando el embed diariamente, sin tickets críticos abiertos sobre el iframe, branding, o auth.
- **Mes 6:** Un segundo cliente B2B (no LeadCars) en producción usando la misma arquitectura sin reescritura de código. Esto valida que la solución es multi-cliente de verdad.
- **Mes 12:** 5+ clientes B2B en producción. La feature white-label es una línea de revenue, no un proyecto one-off.

### Technical Success

- **Cero cookies cross-domain** (las cookies HttpOnly no se usan en el flujo embed). Sesión BFF establecida internamente desde el iframe.
- **Handshake postMessage < 500ms** desde que el iframe carga hasta que la sesión está activa y el dashboard es visible.
- **Origen verificado estrictamente:** solo `event.origin` que matchea el configurado en `embedAllowedOrigins` para la `companyId` puede enviar el token. Rechazo silencioso de orígenes no listados.
- **Token embed opaque (no JWT firmado):** token aleatorio guardado en Redis con TTL de 8 horas, refresco silencioso cada 30 minutos.
- **Sidebar del embed filtrado por rol:** comerciales ven solo su scope; admins ven el scope completo. Las rutas restringidas (`/settings/profile`, `/integrations/leadcars`) devuelven 403.
- **Aislamiento multi-tenant validado por tests:** tests de integración confirman que un usuario de LeadCars no puede leer/escribir datos de otra `companyId`, ni siquiera por URL manipulada.

### Measurable Outcomes

| Métrica | Target |
|---|---|
| Tiempo de carga del iframe (p50) | < 3 segundos |
| Tiempo de handshake postMessage → dashboard | < 500ms |
| Tickets de soporte relacionados con iframe/embed/white-label (mes 1-3) | < 5/mes |
| Uptime del endpoint de embed | ≥ 99.5% |
| Falsos positivos en origin verification (rechazo legítimo) | < 0.1% |
| Falsos negativos en origin verification (acepta origen falso) | 0 (crítico) |
| Tests e2e Playwright que cubren el flujo completo | 100% pass |
| Latencia del refresh de token (p95) | < 100ms |

---

## Product Scope

### MVP - Minimum Viable Product

**Funcionalidades mínimas para que LeadCars pueda usar Guiders como marca blanca en producción:**

1. Endpoint `POST /v2/integration/embed/start` que emite token opaque en Redis (8h TTL).
2. Endpoint `POST /v2/integration/embed/refresh` que renueva el token silenciosamente.
3. Endpoint `GET /embed/start` que sirve HTML wrapper con branding aplicado y bootstrap de postMessage.
4. `BrandingService` que carga `white_label_configs` por `companyId` y aplica CSS variables en el `<head>` antes de cargar Angular.
5. Sidebar del embed filtrado por rol (comercial, supervisor, admin).
6. `EmbedGuard` que valida sesión + rol antes de renderizar rutas.
7. Campo `embedEnabled` y `embedAllowedOrigins` en `white_label_configs`.
8. Rutas restringidas devuelven 403 en embed (`/settings/profile`, `/integrations/leadcars`).
9. Auditoría: evento `EmbedTokenAuthenticated` emitido por cada auth con `companyId`, `userId`, `origin`, `timestamp`, `ipAddress`, `userAgent`.
10. CORS configurado para los orígenes de LeadCars en backend.
11. Tests unitarios, integración y e2e del flujo completo.
12. Documentación `docs/leadcar/embed-integration.md`.

**Out of scope para MVP:**

- Soporte para clientes con el mismo realm de Keycloak (Growth)
- Personalización de copy/i18n por cliente (Growth)
- Branding dinámico más allá de colores/logo/fuentes (Growth)
- Multi-idioma del iframe (Growth)
- Webhooks de eventos del embed al cliente (Growth)
- Multi-cliente self-service configurable por JSON (Vision)
- Marketplace de themes (Vision)
- API pública para integradores con su propio SDK (Vision)

### Growth Features (Post-MVP)

- **SSO silent con realm compartido:** si llega un cliente que SÍ comparte el realm de Guiders, ofrecer login transparente sin token-compartido. Reduce fricción operativa para Guiders.
- **Branding extendido:** i18n, copyOverride por elemento de UI, override de iconografía.
- **Webhooks out:** notificar a LeadCars eventos del embed (chat asignado, lead creado) via webhook firmado. Permite que LeadCars sincronice su estado interno con Guiders.
- **Dashboard de uso para superadmin:** cuántos embeds activos, qué rutas se usan, métricas de salud por cliente B2B. Habilita soporte proactivo.
- **Modo "single-tenant override":** un cliente que quiere TODO Guiders para él (incluyendo crear/eliminar empresa) sin pasar por la API.

### Vision (Future)

- **Multi-cliente configurable por JSON:** un admin de Guiders configura un nuevo cliente white-label en menos de 5 minutos desde el panel superadmin (sin tocar código). Onboarding self-service.
- **Auto-generación de sites y API keys** desde el panel de superadmin para onboarding self-service de clientes B2B.
- **Marketplace de themes:** temas pre-configurados que los clientes pueden elegir con un click.
- **API pública para integradores** que SÍ quieran mantener su propio SDK (reusando lo construido aquí). Posiciona a Guiders como plataforma abierta.

---

## User Journeys

### Persona 1: María — Comercial de LeadCars

María es comercial en LeadCars, 32 años, lleva 3 años vendiendo coches online. Cada mañana abre su CRM de LeadCars en `app.leadcars.com` para revisar leads asignados. Antes de Guiders Embed, tenía que abrir una pestaña aparte para `admin.guiders.es`, loguearse con su email de Guiders, y alternar entre ambas durante todo el día. El logo de Guiders en la otra pestaña le resultaba ajeno: "esto no es nuestro".

**Journey: María abre Guiders desde LeadCars (camino feliz)**

1. María abre `app.leadcars.com` y hace login con sus credenciales de LeadCars (usuario/contraseña, no Keycloak).
2. Hace click en la pestaña "Chat con clientes" (donde LeadCars incrusta el iframe de Guiders).
3. El iframe carga en menos de 3 segundos. María ve su inbox con el logo de LeadCars en la cabecera, los colores corporativos, la tipografía de LeadCars. No hay logos de Guiders visibles.
4. María hace click en un chat asignado. Puede leer el historial, responder, enviar archivos. Todo dentro del iframe.
5. Durante las 8 horas de su jornada, navega entre chats, busca visitantes, consulta leads. En ningún momento ve `guiders.es` en la barra de direcciones ni tiene que re-loguearse.
6. Al final del día cierra la pestaña de LeadCars. Su sesión en Guiders también se cierra (logout implícito).

**Requisitos revelados:**

- Endpoint `POST /v2/integration/embed/start` (FR1, FR2)
- HTML wrapper `GET /embed/start` con branding aplicado (FR35, FR36, FR37)
- `BrandingService` que aplica CSS variables antes de Angular (FR11)
- Sidebar filtrado por rol `commercial` (FR17)
- `EmbedGuard` que valida sesión (FR16)
- Handshake postMessage < 500ms (NFR-P2)
- Sesión de 8h con refresh silencioso (FR30, NFR-S3)
- Logout implícito al cerrar parent (FR28, FR10)

**Edge case: María intenta acceder a `/branding` por URL directa**

1. María está en su iframe, ve la URL `/dashboard`.
2. Teclea manualmente `/branding` en la barra de direcciones.
3. El `EmbedGuard` detecta que su rol `commercial` no incluye permiso para esa ruta en modo embed.
4. Es redirigida a `/embed/error` con mensaje "No tienes permiso para acceder a esta sección". El botón "Reintentar" la lleva a `/dashboard`.

**Requisitos revelados:** `EmbedGuard` valida rol además de sesión (FR16, FR20), página `/embed/error` con UX de recuperación (FR31).

---

### Persona 2: Carlos — Admin de LeadCars

Carlos es IT manager de LeadCars, responsable de la integración técnica con Guiders y de gestionar al equipo de 12 comerciales. Antes de Guiders Embed, Carlos tenía que pedir a Guiders que cambiara el logo o los colores cada vez que LeadCars renovaba su marca. Para crear un nuevo comercial, tenía que entrar al admin de Guiders, recordar su contraseña, crear el usuario, y luego pedirle al comercial que se logueara en `admin.guiders.es` aparte.

**Journey: Carlos configura el branding de LeadCars**

1. Carlos entra a `app.leadcars.com` y navega a la pestaña "Configuración de marca" (iframe de Guiders en modo embed).
2. Ve un formulario con campos para: logo (subir archivo), color primario (color picker), color secundario, fuente (selector).
3. Sube el nuevo logo de LeadCars en formato PNG.
4. Elige el color primario (rojo corporativo de LeadCars) usando el color picker. La previsualización en vivo cambia inmediatamente.
5. Hace click en "Guardar". La confirmación aparece: "Branding actualizado correctamente".
6. Inmediatamente después, en otra pestaña de `app.leadcars.com`, ve el nuevo branding aplicado.

**Requisitos revelados:** Feature `/branding` (FR12, FR13, FR14, FR15), `white-label-data-access` service, upload de logo, previsualización en vivo.

**Journey: Carlos crea un nuevo comercial**

1. Carlos entra al iframe y navega a `/users`.
2. Hace click en "Crear usuario". Aparece un formulario: nombre, email, rol (selector: comercial/supervisor), contraseña temporal.
3. Llena los datos y hace click en "Crear".
4. El sistema crea el `UserAccount` con rol `commercial`, lo vincula a la `companyId` de LeadCars.
5. Carlos recibe confirmación: "Usuario creado. Se ha enviado un email con las credenciales temporales."
6. El nuevo comercial puede empezar a usar el embed inmediatamente.

**Edge case: Carlos quiere deshabilitar el embed para una de sus sub-empresas**

- Carlos intenta acceder a "Configuración de embed" en su panel.
- No existe esta opción (correctamente).
- Si Carlos realmente necesita deshabilitarlo, contacta al equipo de Guiders, que lo cambia en su panel superadmin.

**Requisitos revelados:** `embedEnabled` SOLO modificable por superadmin de Guiders (FR22, FR23), documentación clara de separación de responsabilidades.

---

### Persona 3: Laura — Soporte de Guiders HQ

Laura trabaja en soporte de Guiders. Un día recibe un ticket de LeadCars: "El iframe no carga para algunos de nuestros comerciales". Laura necesita investigar el problema sin tener acceso al panel de LeadCars.

**Journey: Laura investiga un ticket de embed**

1. Laura busca al cliente por `companyId` en su panel de superadmin.
2. Ve el historial de autenticaciones: cada evento `EmbedTokenAuthenticated` con `companyId`, `userId`, `origin`, `timestamp`, `ipAddress`, `userAgent`.
3. Filtra por el `userId` reportado en el ticket y ve que las autenticaciones exitosas pararon hace 2 días a las 14:32.
4. Antes de ese timestamp, ve muchos `origin: https://app.leadcars.com` correctos. Después, no ve nada de ese usuario.
5. Conclusión: el problema no es de Guiders, es que el comercial dejó de hacer click en la pestaña, o el backend de LeadCars no está enviando el `postMessage('leadcars:auth')` correctamente.
6. Laura contacta al equipo técnico de LeadCars con el log detallado.

**Requisitos revelados:** Evento `EmbedTokenAuthenticated` con todos los campos de auditoría (FR25, FR26), panel superadmin que muestra logs de embed por companyId (FR27), exportación de logs.

---

### Persona 4: Diego — Backend developer de LeadCars

Diego mantiene el frontend de LeadCars en `app.leadcars.com`. Necesita integrar el iframe de Guiders en su código. Según el constraint de LeadCars, no quiere mantener un SDK ni un web component, pero necesita saber el contrato mínimo.

**Journey: Diego integra el iframe en su frontend**

1. Diego lee `docs/leadcar/embed-integration.md` (5 min).
2. Ve que solo necesita agregar un `<iframe>` con atributos: `src="https://app.guiders.es/embed/start?company=leadcars&user=u_123"`.
3. Y un listener `window.addEventListener('message', ...)` para responder a `postMessage` desde el iframe.
4. Cuando su usuario hace click en la pestaña de chat, su código envía `postMessage('leadcars:auth', { token, userId })` al iframe.
5. Diego no necesita mantener NADA más. Si Guiders cambia la versión del admin, el iframe sigue funcionando porque Guiders mantiene el wrapper.

**Requisitos revelados:** Documentación `docs/leadcar/embed-integration.md` clara y concisa (FR38, FR39), contrato `postMessage` versionado (FR40), compatibilidad hacia atrás garantizada por Guiders.

### Journey Requirements Summary

| Journey | Capacidades requeridas |
|---|---|
| María (comercial) | Auth embed, branding, sidebar por rol, sesión 8h, refresh silencioso, logout implícito |
| Carlos (admin) | Feature `/branding`, gestión de usuarios, multi-tenant isolation, previsualización en vivo |
| Laura (soporte Guiders) | Auditoría con `EmbedTokenAuthenticated`, panel superadmin de logs, exportación |
| Diego (backend LeadCars) | Documentación mínima, contrato postMessage versionado, cero mantenimiento de código |

---

## Domain-Specific Requirements

Aunque el dominio clasificado es `general` (no regulated industry como healthcare o fintech), Guiders maneja **datos personales de visitantes web** (nombre, email, teléfono, IP, comportamiento de navegación). Esto activa obligaciones de GDPR/LOPDGDD sin que el producto sea específicamente de un vertical regulado.

Adicionalmente, como plataforma multi-tenant white-label, hay consideraciones de aislamiento, atribución de datos y responsabilidad legal entre Guiders HQ y cada cliente B2B.

### Compliance & Regulatory

- **GDPR/LOPDGDD:** Guiders HQ es responsable del tratamiento de los datos de visitantes web. LeadCars (cliente B2B) NO es responsable del tratamiento de los datos capturados por el chat; sí es responsable si esos datos se sincronizan con su CRM (LeadCars CRM) y salen de Guiders. Esta separación debe documentarse en el contrato B2B.
- **Logs de auditoría:** Cada `EmbedTokenAuthenticated` se persiste con `companyId`, `userId`, `origin`, `timestamp`, `ipAddress`, `userAgent`. Retención: 12 meses.
- **Consentimiento de visitantes:** El widget de chat (que NO es alcance de este PRD) ya implementa GDPR consent. El embed del panel admin no captura datos de visitantes, solo consume auth.
- **Acceso a datos por país:** Si un cliente B2B tiene restricciones de residencia de datos (ej. cliente francés que requiere datos en EU), el plan de infraestructura actual de Guiders (MongoDB en EU) lo cubre. No requiere cambio.

### Technical Constraints

- **Aislamiento multi-tenant estricto:** Ninguna query de negocio puede escapar del `companyId` del usuario autenticado. Tests de integración deben validar que un usuario de LeadCars no puede leer/escribir datos de otra `companyId`, ni siquiera por URL manipulada.
- **Origen verificado estrictamente:** `event.origin` en el `postMessage` debe matchear **exactamente** el origen configurado en `embedAllowedOrigins` para la `companyId`. Rechazo silencioso de orígenes no listados.
- **Sin elevación de privilegios:** Un token embed NUNCA puede usarse para acceder a endpoints de Guiders HQ o de otra `companyId`. La validación de `companyId` en el `IntegrationApiKeyGuard` ya previene esto; los handlers nuevos deben replicar el patrón.
- **Tokens opacos, no JWT firmados:** El token embed es una cadena aleatoria guardada en Redis. No incluye información del usuario.
- **Refresh silencioso sin interrumpir al usuario:** El iframe renueva el token cada 30 minutos sin que el usuario lo note. Si la renovación falla, se muestra una pantalla de error con botón "Reintentar".
- **Logout en cascada:** Si el parent (frontend de LeadCars) cierra la sesión, el iframe debe enterarse via `postMessage('leadcars:logout')` y limpiar su sesión BFF.

### Integration Requirements

- **Keycloak de Guiders HQ:** Los usuarios de LeadCars tienen cuentas en `user_account_entity` con `companyId` apuntando a LeadCars. Si también usan el realm de Guiders en Keycloak, su `keycloakId` está vinculado. Si NO (caso más probable, dado que LeadCars tiene su propio IdP), solo existen en BD de Guiders. El flujo de embed soporta ambos casos: la auth se valida en Guiders via `userId` + `companyId`, independientemente de Keycloak.
- **Módulo `white-label` existente:** Reusar `white_label_configs` (MongoDB) por `companyId`. Añadir `embedEnabled: boolean` y `embedAllowedOrigins: string[]` como campos nuevos en el schema. NO crear un nuevo módulo.
- **Módulo `integration-api-key` existente:** Reusar `IntegrationApiKey` para que LeadCars se autentique contra `POST /v2/integration/embed/start`. NO crear un nuevo tipo de API key.
- **CORS en backend:** Añadir los orígenes de LeadCars (`https://app.leadcars.com`, `https://www.leadcars.com`) a la allowlist de CORS en `main.ts`. Headers necesarios: `Content-Type`, `Authorization`, `X-Api-Key`.
- **CSP frame-ancestors por empresa:** Si la solución multi-cliente lo requiere, permitir configurar `frame-ancestors` por `companyId`. En MVP, mantener el default global y documentar que el embed no depende de CSP porque es Guiders quien sirve el HTML wrapper.

### Risk Mitigations

| Riesgo | Mitigación |
|---|---|
| Token leak via XSS en app.leadcars.com | Token de corta duración (8h con refresh); logout en cascada; validación de origin |
| Backend de LeadCars comprometido | Cada request tiene su propio token; ventana de compromiso limitada a 8h por usuario |
| Suplantación de `userId` en el handshake | Validación server-side: el `userId` debe existir y pertenecer a la `companyId` del API key |
| Token replay entre companies | API key guard valida que pertenece a la `companyId` solicitada |
| Branding rompe accesibilidad | Validación de contraste WCAG AA en el picker de colores del feature `/branding` |
| Logout no propaga de parent a iframe | Contrato `postMessage('leadcars:logout')` documentado y testeado |
| iframe carga con problemas de CORS | CORS pre-configurado en `main.ts` antes del primer deploy |
| Sidebar se filtra por rol pero el backend permite más | Doble verificación: `EmbedGuard` (frontend) + `RolesGuard` (backend) ya existente |
| Cliente sube logo malicioso (XSS) | El logo se sirve desde S3 con Content-Type correcto; no se inyecta HTML en el DOM |

---

## SaaS B2B Specific Requirements

### Project-Type Overview

Guiders Embed es una feature que extiende la plataforma SaaS B2B existente (`guiders-backend`) para soportar white-label del panel admin a clientes B2B. La plataforma ya es multi-tenant y tiene un modelo RBAC con 4 roles. Esta feature añade la capacidad de incrustar el panel admin en el frontend del cliente manteniendo todo el control técnico en Guiders.

### Tenant Model

**Modelo actual (sin cambios):** cada empresa cliente es una `Company` con `id` (UUID) en PostgreSQL. Todos los datos de negocio (chats, visitantes, leads, configuración de LLM, branding) están filtrados por `companyId`. El aislamiento multi-tenant es estricto y validado por tests de integración.

**Cambios derivados del embed:**

- Cada cliente B2B (ej. LeadCars) tiene su propia `Company` con `companyId`. No se crea un modelo de "tenant" paralelo.
- El `white_label_configs` se asocia por `companyId` (ya existe).
- El `IntegrationApiKey` se asocia por `companyId` (ya existe).
- Se añade el campo `embedEnabled: boolean` y `embedAllowedOrigins: string[]` a `white_label_configs` para el gating por empresa.
- La URL del embed (`https://app.guiders.es/embed/start?company=xxx&user=yyy`) lleva el `companyId` y el `userId` como query params para que el wrapper sepa qué branding aplicar y qué usuario autenticar.

**Multi-tenant constraint clave:** el `companyId` es inmutable una vez creado. Renombrar, fusionar o mover empresas requiere operación manual de un `superadmin` de Guiders HQ. No es alcance del embed.

### RBAC Matrix

**Modelo actual (sin cambios estructurales):** 4 roles.

| Rol | Acceso actual | Acceso en embed |
|---|---|---|
| `superadmin` | Multi-empresa, Guiders HQ | NO accede al embed (es interno de Guiders, no cliente) |
| `admin` | Una empresa, gestión completa | Ve Dashboard, Users, Integraciones, Leads, IA, Marca Blanca |
| `supervisor` | Una empresa, gestión de equipo comercial | Ve Dashboard, Visitors, Leads, Reglas de asignación |
| `commercial` | Una empresa, chat comercial | Ve Dashboard, Visitors, Leads (lectura) |

**Matriz de permisos por ruta en embed (sidebar filtrado):**

| Ruta | superadmin | admin | supervisor | commercial |
|---|---|---|---|---|
| `/dashboard` | n/a | ✅ | ✅ | ✅ |
| `/users` | n/a | ✅ | ❌ | ❌ |
| `/integrations/api-keys` | n/a | ✅ | ❌ | ❌ |
| `/integrations/sites` | n/a | ✅ | ❌ | ❌ |
| `/integrations/leadcars` | n/a | ❌ (oculto) | ❌ | ❌ |
| `/leads/list` | n/a | ✅ | ✅ | ✅ |
| `/leads/sync-records` | n/a | ✅ | ✅ | ✅ |
| `/ai` | n/a | ✅ | ❌ | ❌ |
| `/branding` | n/a | ✅ | ❌ | ❌ |
| `/settings/profile` | n/a | ❌ (403) | ❌ (403) | ❌ (403) |

**Cambios derivados del embed:**

- El `sidebarItems` en `apps/admin/src/app/app.ts:61-132` pasa de hardcoded a `computed()` que evalúa `currentUser()?.roles` (igual que ya hace `isAdmin` en línea 47-49).
- Las rutas restringidas devuelven 403 en modo embed, no 404 (no revelar existencia).
- El token embed lleva el array `roles` para que el sidebar se renderice sin round-trip extra al backend.
- El refresh del token es reactivo a cambios de rol: si un admin es degradado a commercial, el iframe refleja el cambio en menos de 30 minutos.

### Subscription Tiers

**No aplica para esta feature.** Guiders no tiene un modelo de "suscripción" para el embed: el embed está incluido como funcionalidad estándar para todos los clientes que tengan `embedEnabled=true` en su `white_label_configs`.

### Integration List

**Integraciones existentes reutilizadas:**

- **Módulo `auth` (BFF + Keycloak):** Reusar el patrón de autenticación server-to-server con `IntegrationApiKey`. NO añadir un nuevo tipo de API key. El mismo token `gdr_live_xxx` que LeadCars ya usa para sincronizar leads sirve para `POST /v2/integration/embed/start`.
- **Módulo `white-label`:** Reusar `white_label_configs` para aplicar branding. Añadir `embedEnabled: boolean` y `embedAllowedOrigins: string[]` como campos nuevos.
- **Módulo `company`:** Reusar `Company`, `Site`, `UserAccount`. El embed no introduce nuevos modelos de dominio.

**Integraciones nuevas:**

- **Handshake `postMessage` cross-frame:** el `apps/admin` (Angular) envía y recibe mensajes del parent (frontend de LeadCars). Contrato versionado:
  - `guiders:v1:ready` (iframe → parent): el iframe está listo
  - `guiders:v1:event` (iframe → parent): notificaciones opt-in (futuro, fuera de MVP)
  - `leadcars:v1:auth` (parent → iframe): handshake de auth con `{ token, userId }`
  - `leadcars:v1:logout` (parent → iframe): logout en cascada
- **CORS en backend:** añadir los orígenes de LeadCars a la allowlist de `main.ts`.

### Compliance Requirements

Cubierto en detalle en la sección "Domain-Specific Requirements" (Compliance & Regulatory).

### Technical Architecture Considerations

**Patrones de arquitectura a respetar (de `project-context.md`):**

- **DDD + CQRS:** Agregados, value objects, comandos y queries con el patrón `Result<T, E>`. Comandos nuevos siguen la estructura documentada.
- **Eventos de dominio:** `EmbedTokenAuthenticated` se publica via `aggregate.apply()` + `aggregate.commit()` después de save.
- **V2 contexts:** el código nuevo va en contextos V2 (MongoDB). El `white-label` ya es V2, así que la feature se integra naturalmente.
- **Token opaque (no JWT):** almacenado en Redis con TTL. NO requiere un nuevo aggregate ni repository; se usa directamente el cliente Redis del BFF existente.
- **Inyección de dependencias por Symbol:** los nuevos servicios usan el patrón `Symbol` token, no clase directa.
- **Tests en `__tests__/`** junto al archivo fuente, con UUIDs reales (`Uuid.random().value`), describe en español, mocks con `jest.Mocked<T>`.

**Cambios al modelo de datos:**

- `white_label_configs` (MongoDB) añade campos:
  - `embedEnabled: boolean` (default `false`)
  - `embedAllowedOrigins: string[]` (default `[]`)
- `user_account_entity` (PostgreSQL) **sin cambios**. Los usuarios ya tienen `companyId`, y la auth embed se valida contra `userId` + `companyId`.
- `integration_api_keys` (PostgreSQL) **sin cambios**. Reusar las API keys existentes.
- Redis: nueva key `embed:token:<token>` con TTL 8h. Value: JSON con `{ userId, companyId, roles, createdAt }`. Limpieza automática por TTL.
- Redis: nueva key `embed:refresh:<userId>` con TTL 30min. Value: el último token válido para este usuario (para rate limiting del refresh).

**Cambios al backend (NestJS):**

- Nuevo: `src/context/auth/integration-api-key/infrastructure/controllers/embed.controller.ts` con `POST /v2/integration/embed/start` y `POST /v2/integration/embed/refresh`
- Nuevo: `src/context/auth/integration-api-key/application/commands/create-embed-token.command.ts` y `create-embed-token-command.handler.ts`
- Nuevo: `src/context/auth/integration-api-key/application/commands/refresh-embed-token.command.ts` y `refresh-embed-token-command.handler.ts`
- Nuevo: `src/context/auth/integration-api-key/domain/events/embed-token-authenticated.event.ts`
- Modificado: `src/context/white-label/infrastructure/persistence/mongo-white-label-config.repository.impl.ts` para incluir los nuevos campos
- Modificado: `src/context/white-label/domain/entities/white-label-config.ts` para incluir los nuevos campos en primitivos y value object
- Modificado: `src/main.ts` para añadir orígenes de CORS

**Cambios al frontend (Angular — guiders-frontend):**

- Nuevo: `apps/admin/src/app/embed/embed-wrapper.component.ts`
- Nuevo: `apps/admin/src/app/embed/embed-bootstrap.service.ts`
- Nuevo: `apps/admin/src/app/embed/branding.service.ts` (extendido)
- Nuevo: `apps/admin/src/app/embed/embed.guard.ts`
- Nuevo: `apps/admin/src/app/embed/embed.routes.ts`
- Nuevo: `apps/admin/src/app/embed/embed-error/embed-error.component.ts`
- Modificado: `apps/admin/src/app/app.ts` (sidebar `computed()` filtrado por rol, detección `isEmbedMode`)
- Modificado: `apps/admin/src/app/app.html` (ocultar chrome si embed)
- Modificado: `apps/admin/src/app/app.routes.ts` (rutas `/embed/*` y `/branding`)
- Nuevo: `libs/admin/features/white-label/src/` (feature completo para `/branding`)
- Nuevo: `libs/admin/features/white-label/src/lib/white-label-data-access/white-label.service.ts`
- Nuevo: `libs/shared/types/src/lib/white-label.types.ts`

### Implementation Considerations

**Orden de implementación recomendado:**

1. **Backend primero** (sin UI): el `POST /v2/integration/embed/start` y la creación de tokens en Redis se pueden probar con curl.
2. **Endpoint `/embed/start` HTML wrapper**: sirve el admin con branding aplicado via inline CSS en `<head>`.
3. **Bootstrap `postMessage`**: handshake entre iframe y parent.
4. **`BrandingService`**: carga `white_label_configs` y aplica CSS variables.
5. **Sidebar filtrado por rol**: refactor de `apps/admin/src/app/app.ts`.
6. **`EmbedGuard` y rutas restringidas**: 403 para `/settings/profile` y `/integrations/leadcars`.
7. **Feature `/branding`**: UI completa en el admin.
8. **Tests e2e Playwright**: simulan el flujo completo con un parent mock (servido por nginx en el test).

**Riesgos de implementación:**

- El `BrandingService` debe cargar ANTES de Angular boot para evitar flash de Guiders. Solución: inline CSS en el `<head>` del HTML wrapper, antes del `<script src="...">` de Angular.
- El `embedEnabled` y `embedAllowedOrigins` deben cachearse en memoria del servidor para no hacer una query a MongoDB en cada request al embed. Patrón cache-aside con TTL corto (60 segundos).
- El refresh de token debe ser transparente: si el usuario está en medio de una operación crítica, el refresh no debe interrumpirle. Implementar con `setTimeout` cancelable.

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** **Problem-solving MVP con gates de aceptación duros**.

El objetivo del MVP es demostrar que el patrón "iframe + postMessage + token opaque + módulo `white-label` existente" funciona end-to-end con LeadCars en producción, validando:

1. **El constraint arquitectónico crítico**: que se puede soportar white-label B2B sin que el cliente mantenga código (diferenciador clave).
2. **El modelo de seguridad**: que origin verification + tokens opacos + refresh silencioso son defendibles para producción.
3. **El multi-tenant sin reescritura**: que un segundo cliente B2B puede activarse solo con config, sin código nuevo.

El MVP NO intenta maximizar features, validar modelo de negocio, ni firmar contratos comerciales (esos son procesos paralelos).

**Resource Requirements:**

- 1 backend developer senior (NestJS, DDD/CQRS, Redis): 8-10 días
- 1 frontend developer senior (Angular, Nx, postMessage): 6-8 días
- 0.5 SRE/DevOps (CORS, monitoring, deploy): 1-2 días
- 0.5 QA (e2e Playwright, security review): 2-3 días

Total: **~15-20 días-hombre** (~3-4 semanas con 1 dev backend + 1 dev frontend en paralelo).

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**

- **María (comercial)**: puede abrir Guiders desde app.leadcars.com con branding LeadCars, ver su inbox, responder chats. Su sidebar muestra solo lo que le corresponde.
- **Carlos (admin)**: puede configurar el branding (logo, colores) y gestionar su equipo de comerciales desde el iframe.
- **Laura (soporte Guiders)**: puede investigar incidentes viendo los logs de `EmbedTokenAuthenticated` filtrados por `companyId`.
- **Diego (backend LeadCars)**: integra el iframe en menos de 5 minutos leyendo `docs/leadcar/embed-integration.md`.

**Must-Have Capabilities:** ver lista en "Product Scope → MVP".

### Post-MVP Features

Ver lista detallada en "Product Scope → Growth Features" y "Vision".

### Risk Mitigation Strategy

**Technical Risks:**

| Riesgo | Mitigación |
|---|---|
| El patrón "iframe + postMessage" tiene fricción con Safari ITP | Tests e2e en Safari; fallback a redirección si postMessage no funciona (no MVP, documentado) |
| El refresh silencioso interrumpe operaciones críticas | Implementar con `setTimeout` cancelable; solo refresh cuando no hay requests en vuelo |
| El branding CSS se aplica tarde y hay flash de Guiders | Inline CSS en `<head>` del HTML wrapper, ANTES del `<script>` de Angular |
| `event.origin` spoofing | Verificación estricta + tests de seguridad con penetration testing básico |
| Token leak en logs del backend de LeadCars | Documentar que el token NO debe loggearse en el backend de LeadCars; warning en la doc |

**Market Risks:**

| Riesgo | Mitigación |
|---|---|
| LeadCars decide no seguir adelante con el proyecto | Mantener scope MVP ajustado para que el esfuerzo no sea wasted; el patrón "iframe + postMessage" es genérico y reusable para otros clientes |
| Un segundo cliente B2B requiere features que el MVP no soporta | La arquitectura está diseñada para extender; Growth phase cubre los casos más probables |
| El mercado de white-label B2B para chat no es viable | Out of scope de este PRD; se valida comercialmente por separado |

**Resource Risks:**

| Riesgo | Mitigación |
|---|---|
| Solo 1 dev backend disponible | El backend es la mitad crítica; con 1 dev senior, 8-10 días es realista |
| LeadCars cambia requisitos durante implementación | Contrato de scope firmado ANTES de empezar; cambios vía change request con coste extra |
| Bugs de seguridad descubiertos tarde en QA | Security review OWASP top 10 ANTES de merge a main; penetration testing básico antes de go-live |
| El primer deploy falla por config de CORS o CSP | Pre-flight en staging con un LeadCars mock; checklist de go-live en `docs/leadcar/embed-integration.md` |

### Scope Decisions Summary

**Lo que entra en MVP** (12 must-haves, ~3-4 semanas):

- Endpoint embed + token opaque + refresh silencioso
- HTML wrapper con branding inline
- Sidebar filtrado por rol
- EmbedGuard con 403 en rutas restringidas
- Auditoría con `EmbedTokenAuthenticated`
- CORS configurado
- Tests completos
- Documentación

**Lo que NO entra en MVP** (deferred a Growth/Vision):

Ver "Product Scope → MVP → Out of scope".

**Criterios de "MVP done":**

- LeadCars activo en producción durante 2 semanas consecutivas
- Cero tickets críticos de iframe/embed/auth
- 5+ comerciales de LeadCars usando el embed diariamente
- 100% de los tests e2e Playwright en pass
- Documentación `docs/leadcar/embed-integration.md` publicada

---

## Functional Requirements

### Capability Area 1: Embed Token Management

- **FR1:** LeadCars (su backend) can request a short-lived embed token for a specific user, authenticated via their existing Integration API Key.
- **FR2:** LeadCars can request a token refresh for an active session before the current token expires, without re-authenticating.
- **FR3:** The system can revoke an embed token (logout, suspicious activity, or admin action).
- **FR4:** The system can validate an embed token in real-time and return the associated user identity and permissions.
- **FR5:** A token can only be used to authenticate the user it was issued for; tokens are not transferable between users.

### Capability Area 2: Cross-Frame Authentication Handshake

- **FR6:** The Guiders iframe can signal to the parent (LeadCars frontend) that it is ready to receive authentication.
- **FR7:** The parent can send authentication credentials to the iframe via cross-frame messaging, including the embed token and target user identity.
- **FR8:** The iframe can verify that the message origin matches a pre-configured allowlist for the tenant before accepting the credentials.
- **FR9:** The iframe can establish a BFF session internally upon successful credential validation, without requiring cross-domain cookies.
- **FR10:** The parent can send a logout signal to the iframe, and the iframe can terminate the BFF session in response.

### Capability Area 3: White-Label Branding Application

- **FR11:** The system can apply tenant-specific branding (colors, logo, favicon, typography) to the embedded admin panel.
- **FR12:** An admin of a tenant can configure their branding via the embedded admin panel, including uploading logo and favicon files and selecting color values and font families.
- **FR13:** Branding changes take effect immediately for new embed sessions without requiring a code deployment.
- **FR14:** The system can validate that uploaded branding assets (logos, fonts) meet file size and format constraints before accepting them.
- **FR15:** The system can validate that color values selected by the admin meet WCAG AA contrast requirements for accessibility.

### Capability Area 4: Role-Based Access Control in Embed Mode

- **FR16:** A user authenticated via embed can access only the routes and actions permitted by their role within the embed context.
- **FR17:** A user with the `commercial` role sees a navigation sidebar containing only their permitted areas (dashboard, visitors, leads).
- **FR18:** A user with the `supervisor` role sees a navigation sidebar with their permitted areas, including chat assignment and assignment rules.
- **FR19:** A user with the `admin` role sees the full navigation sidebar for their tenant, including user management, integrations, branding, and AI configuration.
- **FR20:** The embed can prevent direct URL access to tenant-internal routes (e.g. user profile settings, LeadCars CRM configuration) by returning an access-denied response in embed mode.

### Capability Area 5: Multi-Tenant Isolation

- **FR21:** A user authenticated via embed can only access data belonging to their own tenant; cross-tenant data access is blocked at all layers.
- **FR22:** A superadmin of Guiders HQ can enable or disable the embed feature for a specific tenant via configuration.
- **FR23:** A superadmin of Guiders HQ can configure the allowed origin URLs (parent domains) for each tenant's embed.
- **FR24:** When the embed is disabled for a tenant, token requests for that tenant are rejected.

### Capability Area 6: Audit and Observability

- **FR25:** The system can log every successful embed authentication event with the tenant ID, user ID, origin URL, timestamp, IP address, and user agent.
- **FR26:** The system can log every failed embed authentication attempt (invalid token, origin mismatch, unknown user) with diagnostic context.
- **FR27:** A support user of Guiders HQ can query the audit log by tenant ID, user ID, or time range to investigate incidents.

### Capability Area 7: Cross-Frame Lifecycle Management

- **FR28:** The Guiders iframe can detect when the parent window is closed or navigates away, and can terminate the BFF session in response.
- **FR29:** The Guiders iframe can detect when the network connection is lost and can display a recovery UI to the user.
- **FR30:** The Guiders iframe can detect when a session is about to expire and can automatically refresh the token in the background, without user-visible interruption.
- **FR31:** The Guiders iframe can display a user-friendly error state when authentication fails, with a retry action.

### Capability Area 8: Integration with Existing Tenant Infrastructure

- **FR32:** LeadCars can use their existing Integration API Key (already used for lead synchronization) to authenticate embed token requests; no new credential type is required.
- **FR33:** The system can read existing `white_label_configs` to apply branding; no separate branding configuration is required for embed.
- **FR34:** The system can read existing user accounts from `user_account_entity` to authenticate embed users; no separate user store is required for embed.

### Capability Area 9: Embed Mode Visual Adaptation

- **FR35:** The Guiders admin panel can detect when it is running in embed mode (inside an iframe) versus standalone mode.
- **FR36:** The Guiders admin panel can hide its standalone navigation chrome (sidebar, top bar, footer) when running in embed mode.
- **FR37:** The Guiders admin panel can apply the tenant's branding CSS variables before the Angular application boots, to prevent visual flash of the unbranded state.

### Capability Area 10: Documentation and Onboarding

- **FR38:** LeadCars (their developers) can read a documentation guide explaining how to integrate the embed iframe in their frontend, in less than 5 minutes.
- **FR39:** The documentation guide can include a minimal working code example for the integration.
- **FR40:** The documentation guide can include a description of the cross-frame messaging contract (event names, payload schemas, version compatibility).

---

## Non-Functional Requirements

### Performance

- **NFR-P1:** El iframe del embed debe cargar completamente (HTML wrapper + CSS inline + Angular boot) en menos de 3 segundos (p50) en una conexión broadband típica.
- **NFR-P2:** El handshake `postMessage` desde `guiders:v1:ready` hasta que la sesión BFF está activa y el dashboard es visible debe completarse en menos de 500ms (p95).
- **NFR-P3:** El endpoint `POST /v2/integration/embed/start` debe responder en menos de 200ms (p95), incluyendo consulta a MongoDB y escritura a Redis.
- **NFR-P4:** El endpoint `POST /v2/integration/embed/refresh` debe responder en menos de 100ms (p95), porque se llama cada 30 minutos y no debe interrumpir al usuario.
- **NFR-P5:** El endpoint `GET /embed/start` debe responder en menos de 500ms (p95), incluyendo lectura de `white_label_configs` (con cache), generación de HTML wrapper, y bootstrap de postMessage.
- **NFR-P6:** La aplicación Angular del admin, una vez cargada, debe tener interacciones (cambio de ruta, click en botón) por debajo de 100ms de respuesta.

### Security

- **NFR-S1:** Todos los tokens embed son opacos (cadenas aleatorias criptográficas de 256 bits mínimo), NO JWT firmados. La información del usuario se consulta DESPUÉS de validar el token.
- **NFR-S2:** La verificación de `event.origin` en el listener de `postMessage` es estricta: debe matchear EXACTAMENTE uno de los orígenes en `embedAllowedOrigins` para la `companyId`. Cualquier mismatch resulta en rechazo silencioso.
- **NFR-S3:** Los tokens embed tienen un TTL máximo de 8 horas. El refresh silencioso cada 30 minutos es la única forma de extender la sesión.
- **NFR-S4:** El endpoint `POST /v2/integration/embed/start` valida que el `IntegrationApiKey` pertenece a la `companyId` solicitada. Si no, devuelve 403. (Reusa el patrón de `IntegrationApiKeyGuard` existente.)
- **NFR-S5:** El endpoint `POST /v2/integration/embed/start` valida que el `userId` solicitado existe y pertenece a la `companyId`. Si no, devuelve 403.
- **NFR-S6:** Ningún endpoint de Guiders HQ (panel superadmin, multi-tenant) es accesible con un token embed. Los handlers de embed validan explícitamente que el contexto es embed antes de proceder.
- **NFR-S7:** Los assets de branding (logos, favicons, fuentes) se sirven desde S3 con `Content-Type` correcto, no desde el backend. Esto previene que un cliente suba un archivo malicioso y lo sirva como HTML.
- **NFR-S8:** Los logs de auditoría con datos personales (`ipAddress`, `userAgent`) tienen retención de 12 meses, alineado con la práctica actual de Guiders para logs de auth. Después se eliminan automáticamente.
- **NFR-S9:** Los tokens embed se almacenan en Redis con `requirepass` configurado (Redis autenticado). El acceso a Redis está restringido a la red interna de Guiders.
- **NFR-S10:** El endpoint `GET /embed/start` aplica headers de seguridad: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (porque el wrapper no debe ser embebido en otro nivel), `Referrer-Policy: strict-origin-when-cross-origin`.

### Scalability

- **NFR-SC1:** El sistema debe soportar 50+ clientes B2B simultáneos en producción (target a 12 meses). Cada cliente puede tener hasta 100 usuarios concurrentes.
- **NFR-SC2:** La carga del endpoint `POST /v2/integration/embed/start` no debe degradar el rendimiento del endpoint regular de login BFF. Se aíslan via namespace en Redis.
- **NFR-SC3:** El HTML wrapper `/embed/start` se sirve desde el mismo proceso NestJS, no requiere infraestructura separada. El cache de `white_label_configs` (TTL 60s) en memoria del proceso reduce la carga en MongoDB a 1 query por minuto por `companyId` activa.
- **NFR-SC4:** El número de tokens embed activos en Redis está limitado por el TTL (8h) y la rotación natural. Un cliente B2B con 100 usuarios × 1 token activo = 100 entries en Redis, negligible.

### Accessibility

- **NFR-A1:** El color picker del feature `/branding` valida que las combinaciones primary/background y secondary/text cumplen WCAG AA contrast (4.5:1 para texto, 3:1 para UI).
- **NFR-A2:** La página `/embed/error` es navegable por teclado (Tab, Enter, Esc). El botón "Reintentar" es focusable y tiene `aria-label` descriptivo.
- **NFR-A3:** El iframe tiene `title` descriptivo para lectores de pantalla: "Guiders Admin - {brandName}".
- **NFR-A4:** El admin Guiders ya cumple WCAG 2.1 AA en standalone mode (auditoría previa). El modo embed NO debe degradar la accesibilidad existente.
- **NFR-A5:** El handshake `postMessage` no depende de UI; usuarios con screen readers experimentan el mismo flujo que usuarios visuales.

### Integration

- **NFR-I1:** El endpoint `POST /v2/integration/embed/start` reusa el `IntegrationApiKeyGuard` existente. No se añade un nuevo tipo de guard.
- **NFR-I2:** El servicio de branding reusa el `IWhiteLabelConfigRepository` existente. No se añade un nuevo repositorio.
- **NFR-I3:** El handshake `postMessage` usa eventos versionados con prefijo (`guiders:v1:ready`, `guiders:v1:event`, `leadcars:v1:auth`, `leadcars:v1:logout`). Cambios incompatibles requieren bump de versión (`v2`).
- **NFR-I4:** El endpoint `GET /embed/start` se sirve desde el mismo proceso NestJS. No requiere NGINX adicional ni configuración especial más allá de CORS.
- **NFR-I5:** El bootstrap de Angular desde el HTML wrapper usa los mismos assets (bundles JS, chunks lazy-loaded) que el admin standalone. No se construye un bundle separado.

### Reliability

- **NFR-R1:** El endpoint `POST /v2/integration/embed/start` tiene un SLA de 99.5% uptime (alineado con el resto de endpoints de Guiders).
- **NFR-R2:** Si Redis está temporalmente no disponible, el endpoint `POST /v2/integration/embed/refresh` devuelve 503 con mensaje "Servicio temporalmente no disponible, reintentar". El iframe muestra la pantalla de error con botón "Reintentar".
- **NFR-R3:** El HTML wrapper `/embed/start` es estático (no requiere DB) excepto para el branding. Si MongoDB no responde en menos de 1s, el wrapper se sirve con branding por defecto (paleta azul Guiders) y el BrandingService lo reemplaza cuando MongoDB responda.
- **NFR-R4:** El cliente frontend de LeadCars puede implementar su propio retry/backoff al llamar a `POST /v2/integration/embed/start`. El endpoint no impone rate limit estricto en MVP, pero el API Key guard loggea cada llamada para detectar abuse.

### Maintainability

- **NFR-M1:** El código nuevo sigue los patrones existentes en `guiders-backend`: DDD/CQRS, Result pattern, V2 contexts (MongoDB), Symbol tokens para DI, `Uuid.random().value` en tests.
- **NFR-M2:** El código nuevo en `guiders-frontend` sigue los patrones existentes: Angular standalone components, signals, Nx workspace structure, Jest con `describe` en español.
- **NFR-M3:** El handshake `postMessage` está documentado en `docs/leadcar/embed-integration.md` con ejemplos de código en JS y TS.
- **NFR-M4:** El campo `embedEnabled` y `embedAllowedOrigins` se documentan en el AGENTS.md del contexto `white-label`.
- **NFR-M5:** Los tests unitarios, integración y e2e siguen la convención de nombres del proyecto: `<archivo>.spec.ts` para unit, `<archivo>.int-spec.ts` para integration.

### Compliance

- **NFR-CO1:** Los logs de auditoría cumplen GDPR/LOPDGDD: solo datos necesarios para operación, retención 12 meses, eliminación automática.
- **NFR-CO2:** El handler de auth embed no captura datos de visitantes web, solo procesa el handshake. Por tanto, NO requiere opt-in de consentimiento del visitante final.
- **NFR-CO3:** El cliente B2B (LeadCars) sigue siendo responsable del tratamiento de los datos que sincroniza con su CRM (LeadCars CRM). El contrato B2B debe documentar esta separación de responsabilidades (ver "Domain-Specific Requirements → Compliance & Regulatory").

---

## Brainstorming Reconciliation

Ideas de la sesión de brainstorming (`brainstorming-session-2026-06-12-1425.md`) que NO se incorporaron explícitamente y razón:

| Idea del brainstorming | Estado en PRD | Razón |
|---|---|---|
| "S1: Web component `<guiders-admin>` con Shadow DOM" | Descartado | LeadCars NO quiere mantener código (constraint duro). Confirmado en la sesión. |
| "C5: BrandingService + ThemeProvider combinados en un WhiteLabelProvider singleton" | Incorporado implícitamente en FR11, FR37 | La funcionalidad está cubierta por los FRs aunque el nombre del componente difiera. |
| "M3: Tema completo que override TODO (no solo CSS variables)" | Diferido a Growth (Branding extendido) | El MVP cubre colores/logo/fuentes; tema completo es scope Growth. |
| "R1: Inversión — Guiders conecta a LeadCars via WebSocket" | Descartado | Inversión no es la dirección correcta dado el constraint de LeadCars. |
| "P3: Eliminar tabla `white_label_configs` con builds separados" | Descartado | El brainstorming lo propuso como alternativa, pero la solución actual (reusar `white_label_configs`) es más simple. |
| "E1: Eliminar `jti` anti-replay" | Incorporado (token opaque) | El token opaque en Redis con TTL elimina la necesidad de `jti` separado. |
| "Personalidad/tone ideas: que el admin se sienta 'nuestro' para LeadCars" | Cubierto implícitamente en "What Makes This Special" | El diferenciador mismo (responsabilidad 100% Guiders, branding completo) es el tono/persona. |

**Tono, filosofía y "feel" ideas del brainstorming:**

- **"LeadCars quiere que NO se note la diferencia"** → Capturado en el Journey de María ("El logo de Guiders en la otra pestaña le resultaba ajeno: 'esto no es nuestro'") y en "What Makes This Special".
- **"Preguntar qué NO quiere hacer es más revelador"** → Mencionado en "What Makes This Special" como insight.
- **"Mantener 100% del código en Guiders"** → Diferenciador principal, repetido en Executive Summary, Success Criteria, User Journeys y SaaS B2B Specific.

No hay ideas soft perdidas; el PRD refleja la filosofía del brainstorming en múltiples secciones.
