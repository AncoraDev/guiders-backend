# SDK Integration Guide: Commercial Availability

This document describes how to integrate commercial availability into the SDK — both the initial check via REST and real-time updates via WebSocket.

---

## Overview

The SDK needs to know whether any commercial is available to attend a visitor **before** a chat session starts. There are two mechanisms:

1. **REST** — poll availability once on page load (`POST /v2/commercials/availability`)
2. **WebSocket** — subscribe to real-time updates (`commercial:availability-changed`)

Both are scoped to a single tenant. The `domain` and `apiKey` identify which company's commercials to query. Results from other companies are never included.

---

## 1. REST: Initial Availability Check

### Endpoint

```
POST /v2/commercials/availability
```

No authentication required. The API Key in the body acts as the credential.

### Request

```json
{
  "domain": "landing.mytech.com",
  "apiKey": "ak_live_1234567890abcdef"
}
```

| Field    | Type   | Required | Notes                                                  |
|----------|--------|----------|--------------------------------------------------------|
| `domain` | string | yes      | The domain of the page loading the SDK. `www.` is stripped automatically. |
| `apiKey` | string | yes      | The API Key issued for this site. Must match the domain. |

### Response `200 OK`

```json
{
  "available": true,
  "onlineCount": 2,
  "siteId": "550e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

| Field        | Type    | Notes                                                         |
|--------------|---------|---------------------------------------------------------------|
| `available`  | boolean | `true` if at least one commercial is online for this tenant   |
| `onlineCount`| number  | Count of online commercials for this tenant only              |
| `siteId`     | string  | UUID of the resolved site (useful for subsequent WS join)     |
| `timestamp`  | string  | ISO 8601 server timestamp                                     |

### Error responses

| Status | Cause                                              |
|--------|----------------------------------------------------|
| `400`  | Missing or empty `domain` / `apiKey`               |
| `401`  | `apiKey` does not match the provided `domain`      |
| `404`  | `domain` not registered in the system              |
| `500`  | Internal server error                              |

### Example (fetch)

```js
const res = await fetch('https://api.guiders.io/v2/commercials/availability', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ domain: window.location.hostname, apiKey: SDK_API_KEY }),
});
const { available, onlineCount, siteId } = await res.json();
```

---

## 2. WebSocket: Real-time Availability Updates

After the initial REST check, the SDK should subscribe to the WebSocket channel to receive live updates without polling.

### Connection

Connect to the WebSocket server with the visitor's credentials (or anonymously if not yet authenticated). The connection URL and auth mechanism are handled by the existing SDK WS setup — no changes needed there.

### Step 1 — Join the tenant room

Once connected, emit `tenant:join` to subscribe to availability events for this tenant:

```js
socket.emit('tenant:join', { tenantId: '<companyId from REST or SDK config>' });
```

> **Where to get `tenantId`**: the `siteId` from the REST response identifies the site, but `tenantId` is the `companyId` of the company. This value should be provided to the SDK at initialization time (same as `apiKey` / `domain` config), or derived from a separate lookup. Ask the backend team for the resolved `companyId` if it is not already available in the SDK config.

#### Success acknowledgement

The server responds with a `tenant:joined` event:

```json
{
  "companyId": "550e8400-e29b-41d4-a716-446655440001",
  "roomName": "tenant:550e8400-e29b-41d4-a716-446655440001",
  "timestamp": 1736936400000
}
```

#### Error (e.g. wrong tenantId for an authenticated commercial)

```json
{
  "message": "No autorizado para unirse a este tenant",
  "timestamp": 1736936400000
}
```

> Note: visitors are not subject to this restriction. Only authenticated commercials are blocked from joining a tenant that is not their own.

### Step 2 — Listen for `commercial:availability-changed`

```js
socket.on('commercial:availability-changed', (payload) => {
  const { available, onlineCount, tenantId, timestamp } = payload;
  // Update UI accordingly
});
```

#### Payload

```json
{
  "available": true,
  "onlineCount": 3,
  "tenantId": "550e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2025-01-15T10:35:00.000Z"
}
```

| Field        | Type    | Notes                                                        |
|--------------|---------|--------------------------------------------------------------|
| `available`  | boolean | `true` if at least one commercial is online for this tenant  |
| `onlineCount`| number  | Current count of online commercials for this tenant          |
| `tenantId`   | string  | UUID of the company (for verification)                       |
| `timestamp`  | string  | ISO 8601 server timestamp of the event                       |

This event fires every time any commercial in the tenant connects, disconnects, or changes status (online → busy, away → online, etc.).

---

## 3. Recommended SDK Flow

```
Page load
  │
  ├─► POST /v2/commercials/availability
  │     ├─ available: true  → show chat widget
  │     └─ available: false → hide chat widget (but still subscribe WS for live updates)
  │
  └─► WS connect
        │
        └─► emit tenant:join { tenantId }
              │
              └─► listen commercial:availability-changed
                    ├─ available: true  → show chat widget
                    └─ available: false → hide chat widget
```

The SDK should not rely solely on the REST poll — it must also react to WS events, since a commercial may go offline after the initial check.

---

## 4. Tenant Isolation Guarantee

All data returned by both the REST endpoint and the WS event is scoped to the company identified by the `domain` + `apiKey` pair. The backend resolves the tenant from the domain and filters Redis sets by `companyId`. It is not possible to receive availability data from a different company through these channels.
