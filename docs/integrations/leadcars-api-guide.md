# LeadCars Integration API Guide

Base URL: `https://guiders.es/api`

All endpoints require a **JWT Bearer token** with `admin` role.

```
Authorization: Bearer <token>
```

---

## Table of Contents

1. [Configuration](#1-configuration)
2. [Test Connection](#2-test-connection)
3. [Sync Records](#3-sync-records)
4. [LeadCars Proxy](#4-leadcars-proxy)

---

## 1. Configuration

### GET `/v1/leads/admin/config`

Returns the LeadCars configuration for the current company, or `404` if none exists.

**Response `200`**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "companyId": "550e8400-e29b-41d4-a716-446655440001",
  "crmType": "leadcars",
  "enabled": true,
  "syncChatConversations": false,
  "triggerEvents": ["lifecycle_to_lead"],
  "config": {
    "clienteToken": "***OCULTO***",
    "useSandbox": false,
    "concesionarioId": 123,
    "sedeId": 456,
    "campanaId": 789,
    "tipoLeadDefault": "web"
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

> Note: `clienteToken` is always masked as `***OCULTO***` in responses.

**Response `404`** — No configuration exists yet.

---

### POST `/v1/leads/admin/config`

Creates the LeadCars configuration for the company.

**Request body**

```json
{
  "companyId": "550e8400-e29b-41d4-a716-446655440001",
  "crmType": "leadcars",
  "enabled": true,
  "syncChatConversations": false,
  "triggerEvents": ["lifecycle_to_lead"],
  "config": {
    "clienteToken": "abc123token",
    "useSandbox": false,
    "concesionarioId": 123,
    "sedeId": 456,
    "campanaId": 789,
    "tipoLeadDefault": "web"
  }
}
```

| Field                    | Type          | Required                              | Description                              |
| ------------------------ | ------------- | ------------------------------------- | ---------------------------------------- |
| `companyId`              | string (UUID) | Yes                                   | Must match the JWT company               |
| `crmType`                | `"leadcars"`  | Yes                                   | Always `"leadcars"` for this integration |
| `enabled`                | boolean       | No (default: `true`)                  | Enable/disable the integration           |
| `syncChatConversations`  | boolean       | No (default: `false`)                 | Sync chat conversations to CRM           |
| `triggerEvents`          | string[]      | No (default: `["lifecycle_to_lead"]`) | Events that trigger sync                 |
| `config.clienteToken`    | string        | Yes                                   | LeadCars API token                       |
| `config.useSandbox`      | boolean       | No (default: `false`)                 | Use sandbox environment                  |
| `config.concesionarioId` | number        | Yes                                   | LeadCars dealer ID                       |
| `config.sedeId`          | number        | No                                    | LeadCars branch ID                       |
| `config.campanaId`       | number        | No                                    | LeadCars campaign ID                     |
| `config.tipoLeadDefault` | string        | No (default: `"web"`)                 | Default lead type ID                     |

**Response `201`** — Returns the created configuration (same shape as GET).

**Response `400`** — Config already exists, or validation errors.

---

### PUT `/v1/leads/admin/config/:id`

Updates an existing configuration.

**Request body** — All fields optional:

```json
{
  "enabled": true,
  "syncChatConversations": false,
  "triggerEvents": ["lifecycle_to_lead"],
  "config": {
    "clienteToken": "newtoken",
    "useSandbox": false,
    "concesionarioId": 123,
    "sedeId": 456,
    "campanaId": 789,
    "tipoLeadDefault": "web"
  }
}
```

**Response `200`** — Returns the updated configuration.

**Response `404`** — Configuration not found.

---

### DELETE `/v1/leads/admin/config/:id`

Deletes a configuration.

**Response `200`**

```json
{ "message": "Configuración eliminada correctamente" }
```

**Response `404`** — Configuration not found.

---

## 2. Test Connection

### POST `/v1/leads/admin/config/:configId/test`

Tests the connection to LeadCars using the **saved configuration** (no credentials in body).

**Response `200`**

```json
{
  "success": true,
  "message": "Conexión con LeadCars establecida correctamente"
}
```

On failure:

```json
{
  "success": false,
  "message": "Error description here"
}
```

**Response `404`** — Configuration not found.

---

### POST `/v1/leads/admin/test-connection`

Tests connection with **manual credentials** (without saving).

**Request body**

```json
{
  "crmType": "leadcars",
  "config": {
    "clienteToken": "abc123token",
    "useSandbox": false,
    "concesionarioId": 123
  }
}
```

**Response `200`**

```json
{
  "success": true
}
```

On failure:

```json
{
  "success": false,
  "error": "Error description"
}
```

On validation error:

```json
{
  "success": false,
  "validationErrors": ["clienteToken is required", "..."]
}
```

---

## 3. Sync Records

### GET `/v1/leads/admin/sync-records`

Returns all sync records for the company.

**Response `200`**

```json
[
  {
    "id": "550e8400-...",
    "visitorId": "550e8400-...",
    "companyId": "550e8400-...",
    "crmType": "leadcars",
    "externalLeadId": "lc_12345",
    "status": "synced",
    "lastSyncAt": "2024-01-01T00:00:00.000Z",
    "lastError": null,
    "retryCount": 0,
    "chatsSynced": ["chat-id-1"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "contactData": {
      "nombre": "John",
      "apellidos": "Doe",
      "email": "john@example.com",
      "telefono": "+34600000000",
      "dni": null,
      "poblacion": "Madrid"
    }
  }
]
```

`status` values: `"pending"` | `"synced"` | `"failed"` | `"partial"`

---

### GET `/v1/leads/admin/sync-records/failed`

Returns only failed sync records for the company. Same response shape as above.

---

### GET `/v1/leads/admin/sync-records/visitor/:visitorId`

Returns sync records for a specific visitor.

**Response `200`** — Array with 0 or 1 items (same shape as above, without `contactData`).

---

## 4. LeadCars Proxy

These endpoints proxy LeadCars API calls using the **stored token**. The frontend never handles the token directly.

All proxy endpoints require that the company has an **active LeadCars configuration** saved. If not, they return `404`.

---

### GET `/v1/leads/admin/leadcars/concesionarios`

Returns the list of dealers available for the configured token.

**Response `200`**

```json
[
  { "id": 1, "nombre": "Concesionario Central" },
  { "id": 2, "nombre": "Concesionario Norte" }
]
```

**Typical usage**: Call this first to populate the dealer selector in the config form.

---

### GET `/v1/leads/admin/leadcars/sedes/:concesionarioId`

Returns the branches for a given dealer.

**Path param**: `concesionarioId` — numeric ID of the dealer.

**Response `200`**

```json
[
  { "id": 10, "nombre": "Sede Principal", "concesionarioId": 1 },
  { "id": 11, "nombre": "Sede Secundaria", "concesionarioId": 1 }
]
```

**Typical usage**: Call after selecting a dealer to populate the branch selector.

---

### GET `/v1/leads/admin/leadcars/campanas/:concesionarioId`

Returns the campaigns for a given dealer.

**Path param**: `concesionarioId` — numeric ID of the dealer.

**Response `200`**

```json
[
  {
    "id": 100,
    "nombre": "Campaña Verano",
    "codigo": "VERANO24",
    "concesionarioId": 1
  },
  { "id": 101, "nombre": "Campaña Web", "codigo": null, "concesionarioId": 1 }
]
```

**Typical usage**: Call after selecting a dealer to populate the campaign selector.

---

### GET `/v1/leads/admin/leadcars/tipos`

Returns the available lead types from LeadCars.

> **Important**: Use the numeric `id` returned here as `tipoLeadDefault` when creating/updating the configuration. Do not use string values like `"COMPRA"`.

**Response `200`**

```json
[
  { "id": 1, "nombre": "Web" },
  { "id": 2, "nombre": "Compra" },
  { "id": 3, "nombre": "Financiación" }
]
```

**Typical usage**: Call to populate the lead type selector. Store the `id` (number) in `config.tipoLeadDefault`.

---

## Recommended Setup Flow

The recommended order to set up the LeadCars integration from the frontend:

```
1. POST /v1/leads/admin/test-connection
   → Validate token + concesionarioId before saving

2. POST /v1/leads/admin/config
   → Save configuration

3. GET /v1/leads/admin/leadcars/concesionarios
   → Load dealer list for selector

4. GET /v1/leads/admin/leadcars/sedes/:concesionarioId
   → Load branches for selected dealer

5. GET /v1/leads/admin/leadcars/campanas/:concesionarioId
   → Load campaigns for selected dealer

6. GET /v1/leads/admin/leadcars/tipos
   → Load lead types for selector

7. PUT /v1/leads/admin/config/:id
   → Update config with selected sedeId, campanaId, tipoLeadDefault

8. POST /v1/leads/admin/config/:id/test
   → Final connection test with saved config
```

---

## Error Responses

All endpoints return standard HTTP error shapes:

```json
{
  "statusCode": 404,
  "message": "No existe configuración de LeadCars para esta empresa",
  "error": "Not Found"
}
```

| Code  | Meaning                                    |
| ----- | ------------------------------------------ |
| `400` | Bad request / validation error             |
| `401` | Missing or invalid JWT token               |
| `403` | Insufficient role (requires `admin`)       |
| `404` | Resource not found or config doesn't exist |
| `500` | LeadCars API returned an error             |
