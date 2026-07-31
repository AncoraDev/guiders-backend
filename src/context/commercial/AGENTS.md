# AGENTS.md - Commercial Context

Presencia y disponibilidad de comerciales (Console ↔ Redis ↔ Web).

**Parent**: [Root AGENTS.md](../../AGENTS.md)

## Presencia manual (producto)

- Login Console → **Desconectado** (no auto-connect).
- Toggle Conectado/Desconectado en Console (`guiders-status-selector`).
- Web demo: `POST /v2/commercials/availability` → `available` si `onlineCount ≥ 1`.
- Cerrar pestaña (`beforeunload` + sendBeacon) o logout → offline.
- **Sin** cron de inactividad (`CommercialInactivityScheduler` desregistrado).

## Sesiones de conexión

Colección Mongo `commercial_connection_sessions`:

| Campo | Uso |
|-------|-----|
| commercialId, companyId | Identidad |
| commercialDisplayName | Nombre/email al abrir (UI Conexiones) |
| startedAt / endedAt | Intervalo |
| durationMs | Cerrado |
| endReason | `manual` \| `logout` \| `browser_close` \| `unknown` |

- Open: `ConnectCommercialCommandHandler` (guarda displayName)
- Close: `DisconnectCommercialCommandHandler`
- List: `GET /v2/commercials/connection-sessions` (filtros + paginación)

### Scoping del listado

| Rol | Visibilidad |
|-----|-------------|
| `commercial` | Solo sus sesiones |
| `admin` / `supervisor` | Toda la compañía; opcional `?commercialId=` |

Query params: `page`, `limit`, `from`, `to`, `endReason`, `status` (`open`\|`closed`), `commercialId`.

## Endpoints clave

| Método | Path | Notas |
|--------|------|-------|
| POST | `/v2/commercials/connect` | Online + open session |
| POST | `/v2/commercials/disconnect` | Offline + close session (`reason` opcional) |
| PUT | `/v2/commercials/status` | Cambio manual de estado |
| POST | `/v2/commercials/availability` | Público (domain + apiKey) |
| GET | `/v2/commercials/connection-sessions` | Historial paginado (Conexiones UI) |

## Testing

```bash
npm run test:unit -- src/context/commercial/**/*.spec.ts
```
