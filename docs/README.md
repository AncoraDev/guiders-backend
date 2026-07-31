# Documentación Guiders Backend

Índice único de la documentación del repositorio. En la raíz solo quedan:

- [`README.md`](../README.md) — producto e instalación
- [`AGENTS.md`](../AGENTS.md) — instrucciones generales para agentes
- [`CLAUDE.md`](../CLAUDE.md) — arquitectura y reglas de desarrollo

Cada bounded context tiene además su propio `src/context/<ctx>/AGENTS.md`.

---

## Arquitectura y overview

| Documento | Descripción |
|-----------|-------------|
| [project-overview.md](./architecture/project-overview.md) | Visión general |
| [architecture.md](./architecture/architecture.md) | Arquitectura técnica |
| [source-tree-analysis.md](./architecture/source-tree-analysis.md) | Árbol de fuentes |
| [component-inventory.md](./architecture/component-inventory.md) | Inventario de componentes |
| [development-guide.md](./architecture/development-guide.md) | Guía de desarrollo local |
| [api-contracts.md](./architecture/api-contracts.md) | Contratos API |
| [data-models.md](./architecture/data-models.md) | Modelos de datos |
| [project-context.md](./architecture/project-context.md) | Contexto de proyecto |

También: [`api/`](./api/), [`diagrams/`](./diagrams/), [`automation/`](./automation/).

---

## Consentimiento / GDPR

Carpeta [`consent/`](./consent/) — guías de consent, versiones, SDK API, secrets y escenarios RGPD. Entrada útil: [CONSENT_README.md](./consent/CONSENT_README.md).

---

## Auth / BFF / Keycloak / sesiones

Carpeta [`auth-bff/`](./auth-bff/) — BFF SPA, cookies HttpOnly, multi-cliente, Keycloak env/setup/logout, session cleanup/expiration.

Destacados:

- [keycloak-environment-variables.md](./auth-bff/keycloak-environment-variables.md)
- [bff-spa-integration-guide.md](./auth-bff/bff-spa-integration-guide.md)
- [bff-httponly-cookies-guide.md](./auth-bff/bff-httponly-cookies-guide.md)

---

## Chat, presence y tiempo real

| Documento | Descripción |
|-----------|-------------|
| [websocket-real-time-chat.md](./chat/websocket-real-time-chat.md) | Chat WebSocket |
| [CHAT_PRESENCE_FRONTEND_GUIDE.md](./chat/CHAT_PRESENCE_FRONTEND_GUIDE.md) | Presence en chat |
| [sdk-commercial-availability.md](./chat/sdk-commercial-availability.md) | Disponibilidad comercial |
| [UNREAD_MESSAGES_SYSTEM.md](./chat/UNREAD_MESSAGES_SYSTEM.md) | No leídos |
| [FIX_CHAT_CREATED_EVENT_LOSS.md](./chat/FIX_CHAT_CREATED_EVENT_LOSS.md) | Fix evento chat created |
| [messages-v2/](./messages-v2/) | Guía endpoint messages V2 |

---

## Tracking y visitors

- [TRACKING_V2_FRONTEND_GUIDE.md](./tracking/TRACKING_V2_FRONTEND_GUIDE.md)
- [visitors-v2/pagination-examples.md](./visitors-v2/pagination-examples.md)

---

## LLM

- [llm-architecture.md](./llm/llm-architecture.md)
- [LLM_TOOL_USE_GUIDE.md](./llm/LLM_TOOL_USE_GUIDE.md)

---

## Integraciones

- [leadcars-api-guide.md](./integrations/leadcars-api-guide.md)
- [leadcar/frontend-integration.md](./integrations/leadcar/frontend-integration.md)

---

## Guías para frontend (consumo de API)

- [INTEGRACION-FRONTEND.md](./frontend-guides/INTEGRACION-FRONTEND.md)
- [GUIA-FRONTEND-COMERCIAL.md](./frontend-guides/GUIA-FRONTEND-COMERCIAL.md)
- [GUIA-FRONTEND-VISITANTE.md](./frontend-guides/GUIA-FRONTEND-VISITANTE.md)
- [e2e-frontend-guide.md](./frontend-guides/e2e-frontend-guide.md)

---

## Seguridad

Carpeta [`security/`](./security/) — auditorías 2025/2026 y reportes. También `security-contracts/` en la raíz del repo (contratos de roles).

---

## Ops, CI, MongoDB, staging

Infra Docker del backend: [`docker/README.md`](../docker/README.md).

Carpeta [`ops/`](./ops/) — docker staging, secrets GitHub, MongoDB E2E/CI, HTTP 304, Swagger analysis.

Testing E2E: [`testing/GUIDERS_E2E_TEST_GUIDE.md`](./testing/GUIDERS_E2E_TEST_GUIDE.md). Load tests: [`test/load/`](../test/load/).

---

## AGENTS por contexto

Ver tabla en [`AGENTS.md`](../AGENTS.md) o el listado histórico en [`index.md`](./index.md) (redirige aquí).
