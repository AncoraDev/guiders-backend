# Integración Frontend - Contexto Leads

## Visión General

El contexto de Leads permite capturar datos de contacto de visitantes y sincronizarlos con CRMs externos (actualmente LeadCars). La integración es **opcional por empresa** y se configura desde el panel de administración.

## Flujo de Datos

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Panel     │────▶│  Capturar   │────▶│  Backend    │────▶│    CRM      │
│   Admin     │     │   Datos     │     │   Guiders   │     │  (LeadCars) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    POST /api/v1/leads/contact-data
```

## Endpoints Disponibles

### 1. Datos de Contacto del Lead

> **Nota:** Estos endpoints requieren autenticación de usuario con rol `admin` o `commercial`.

#### Guardar/Actualizar Datos de Contacto

```http
POST /api/v1/leads/contact-data
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "visitorId": "550e8400-e29b-12d3-a456-426614174001",
  "nombre": "Juan",
  "apellidos": "García López",
  "email": "juan.garcia@ejemplo.com",
  "telefono": "+34612345678",
  "dni": "12345678A",
  "poblacion": "Madrid",
  "additionalData": {
    "marca_interes": "Audi",
    "modelo_interes": "A4",
    "presupuesto": "30000-40000"
  },
  "extractedFromChatId": "550e8400-e29b-12d3-a456-426614174000"
}
```

**Campos:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `visitorId` | string | **Sí** | ID del visitante |
| `nombre` | string | No | Nombre del visitante |
| `apellidos` | string | No | Apellidos del visitante |
| `email` | string | No | Email de contacto |
| `telefono` | string | No | Teléfono de contacto |
| `dni` | string | No | Documento de identidad |
| `poblacion` | string | No | Ciudad/Población |
| `additionalData` | object | No | Datos adicionales flexibles |
| `extractedFromChatId` | string | No | ID del chat donde se extrajo la info |

**Response (201 Created):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "visitorId": "550e8400-e29b-12d3-a456-426614174001",
  "companyId": "550e8400-e29b-12d3-a456-426614174002",
  "nombre": "Juan",
  "apellidos": "García López",
  "email": "juan.garcia@ejemplo.com",
  "telefono": "+34612345678",
  "dni": "12345678A",
  "poblacion": "Madrid",
  "additionalData": {
    "marca_interes": "Audi",
    "modelo_interes": "A4",
    "presupuesto": "30000-40000"
  },
  "extractedFromChatId": "550e8400-e29b-12d3-a456-426614174000",
  "extractedAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

#### Obtener Datos de Contacto por Visitor ID

```http
GET /api/v1/leads/contact-data/visitor/:visitorId
Authorization: Bearer <user_token>
```

**Response (200 OK):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "visitorId": "550e8400-e29b-12d3-a456-426614174001",
  "companyId": "550e8400-e29b-12d3-a456-426614174002",
  "nombre": "Juan",
  "apellidos": "García López",
  "email": "juan.garcia@ejemplo.com",
  "telefono": "+34612345678",
  "extractedAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Response (404 Not Found):** Si el visitante no tiene datos de contacto guardados.

#### Obtener Datos de Contacto por ID

```http
GET /api/v1/leads/contact-data/:id
Authorization: Bearer <user_token>
```

#### Obtener Todos los Datos de Contacto de la Empresa

```http
GET /api/v1/leads/contact-data/company/all
Authorization: Bearer <user_token>
```

> **Nota:** Requiere rol `admin`.

---

### 2. Administración CRM (Panel Admin)

> **Nota:** Estos endpoints requieren autenticación de usuario con rol `admin`.

#### Listar CRMs Soportados

```http
GET /api/v1/leads/admin/supported-crms
Authorization: Bearer <user_token>
```

**Response (200 OK):**
```json
["leadcars"]
```

#### Obtener Configuración CRM de la Empresa

```http
GET /api/v1/leads/admin/config
Authorization: Bearer <user_token>
```

**Response (200 OK):**
```json
[
  {
    "id": "config-uuid-1",
    "companyId": "company-uuid",
    "crmType": "leadcars",
    "enabled": true,
    "syncChatConversations": true,
    "triggerEvents": ["lifecycle_to_lead"],
    "config": {
      "clienteToken": "***",
      "useSandbox": false,
      "concesionarioId": 123,
      "sedeId": 456,
      "campanaId": 789,
      "tipoLeadDefault": "WEB"
    },
    "createdAt": "2024-01-10T08:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

#### Obtener Configuración CRM por ID

```http
GET /api/v1/leads/admin/config/:id
Authorization: Bearer <user_token>
```

#### Crear Configuración CRM

```http
POST /api/v1/leads/admin/config
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "companyId": "company-uuid",
  "crmType": "leadcars",
  "enabled": true,
  "syncChatConversations": true,
  "triggerEvents": ["lifecycle_to_lead"],
  "config": {
    "clienteToken": "mi-token-leadcars",
    "useSandbox": true,
    "concesionarioId": 123,
    "sedeId": 456,
    "campanaId": 789,
    "tipoLeadDefault": "WEB"
  }
}
```

**Configuración específica para LeadCars:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `clienteToken` | string | **Sí** | Token de autenticación de LeadCars |
| `useSandbox` | boolean | No | Usar entorno de pruebas (default: false) |
| `concesionarioId` | number | No | ID del concesionario en LeadCars |
| `sedeId` | number | No | ID de la sede |
| `campanaId` | number | No | ID de la campaña |
| `tipoLeadDefault` | string | No | Tipo de lead por defecto |

**Response (201 Created):**
```json
{
  "id": "config-uuid-new",
  "companyId": "company-uuid",
  "crmType": "leadcars",
  "enabled": true,
  "syncChatConversations": true,
  "triggerEvents": ["lifecycle_to_lead"],
  "config": {
    "clienteToken": "***",
    "useSandbox": true,
    "concesionarioId": 123,
    "sedeId": 456,
    "campanaId": 789,
    "tipoLeadDefault": "WEB"
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

#### Actualizar Configuración CRM

```http
PUT /api/v1/leads/admin/config/:id
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "enabled": false,
  "syncChatConversations": true,
  "triggerEvents": ["lifecycle_to_lead"],
  "config": {
    "clienteToken": "nuevo-token",
    "useSandbox": false
  }
}
```

#### Probar Conexión CRM

```http
POST /api/v1/leads/admin/test-connection
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "crmType": "leadcars",
  "config": {
    "clienteToken": "mi-token-leadcars",
    "useSandbox": true
  }
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Response con error:**
```json
{
  "success": false,
  "error": "Error de autenticación: Token inválido"
}
```

**Response con errores de validación:**
```json
{
  "success": false,
  "validationErrors": ["clienteToken es requerido"]
}
```

#### Eliminar Configuración CRM

```http
DELETE /api/v1/leads/admin/config/:id
Authorization: Bearer <user_token>
```

**Response (200 OK):**
```json
{
  "message": "Configuración eliminada correctamente"
}
```

#### Obtener Registros de Sincronización

```http
GET /api/v1/leads/admin/sync-records
Authorization: Bearer <user_token>
```

**Response (200 OK):**
```json
[
  {
    "id": "sync-record-uuid",
    "visitorId": "visitor-uuid",
    "companyId": "company-uuid",
    "crmType": "leadcars",
    "externalLeadId": "LC-12345",
    "status": "synced",
    "lastSyncAt": "2024-01-15T10:35:00.000Z",
    "lastError": null,
    "retryCount": 0,
    "chatsSynced": ["chat-uuid-1", "chat-uuid-2"],
    "metadata": {
      "leadcarsResponse": { "id": 12345 }
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
]
```

**Estados de sincronización (`status`):**
| Estado | Descripción |
|--------|-------------|
| `pending` | Pendiente de sincronizar |
| `synced` | Sincronizado correctamente |
| `failed` | Error en sincronización |
| `partial` | Sincronización parcial (lead ok, chat fallido) |

#### Obtener Sincronizaciones de un Visitor

```http
GET /api/v1/leads/admin/sync-records/visitor/:visitorId
Authorization: Bearer <user_token>
```

> **Nota:** Disponible para roles `admin` y `commercial`.

#### Obtener Sincronizaciones Fallidas

```http
GET /api/v1/leads/admin/sync-records/failed
Authorization: Bearer <user_token>
```

---

## Integración en el Panel de Administración

### Configuración de CRM

```tsx
// Ejemplo React: Componente de configuración
function CrmConfigPanel() {
  const [configs, setConfigs] = useState<CrmConfig[]>([]);
  const [supportedTypes, setSupportedTypes] = useState<string[]>([]);

  useEffect(() => {
    // Cargar tipos soportados
    fetch('/api/v1/leads/admin/supported-crms', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    })
      .then(res => res.json())
      .then(data => setSupportedTypes(data));

    // Cargar configuraciones actuales
    fetch('/api/v1/leads/admin/config', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    })
      .then(res => res.json())
      .then(setConfigs);
  }, []);

  const saveConfig = async (newConfig: CrmConfigInput) => {
    const response = await fetch('/api/v1/leads/admin/config', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...newConfig,
        companyId: currentUser.companyId, // Debe coincidir con el del token
      }),
    });

    if (response.ok) {
      const saved = await response.json();
      setConfigs([...configs, saved]);
      showSuccess('Configuración guardada');
    }
  };

  const testConnection = async (crmType: string, config: Record<string, unknown>) => {
    const response = await fetch('/api/v1/leads/admin/test-connection', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ crmType, config }),
    });

    const result = await response.json();
    if (result.success) {
      showSuccess('Conexión exitosa');
    } else {
      showError(result.error || result.validationErrors?.join(', '));
    }
  };

  return (
    <div>
      <h2>Configuración de CRM</h2>

      <select onChange={handleCrmTypeChange}>
        <option value="">Seleccionar CRM</option>
        {supportedTypes.map(type => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>

      {selectedCrmType === 'leadcars' && (
        <LeadCarsConfigForm
          onSave={saveConfig}
          onTest={(config) => testConnection('leadcars', config)}
        />
      )}
    </div>
  );
}
```

### Monitoreo de Sincronizaciones

```tsx
function SyncMonitorPanel() {
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [showOnlyFailed, setShowOnlyFailed] = useState(false);

  useEffect(() => {
    const endpoint = showOnlyFailed
      ? '/api/v1/leads/admin/sync-records/failed'
      : '/api/v1/leads/admin/sync-records';

    fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    })
      .then(res => res.json())
      .then(setRecords);
  }, [showOnlyFailed]);

  return (
    <div>
      <h2>Registros de Sincronización</h2>

      <label>
        <input
          type="checkbox"
          checked={showOnlyFailed}
          onChange={e => setShowOnlyFailed(e.target.checked)}
        />
        Mostrar solo fallidos
      </label>

      <table>
        <thead>
          <tr>
            <th>Visitor ID</th>
            <th>CRM</th>
            <th>ID Externo</th>
            <th>Estado</th>
            <th>Última Sync</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {records.map(record => (
            <tr key={record.id}>
              <td>{record.visitorId.slice(0, 8)}...</td>
              <td>{record.crmType}</td>
              <td>{record.externalLeadId || '-'}</td>
              <td>
                <StatusBadge status={record.status} />
              </td>
              <td>{formatDate(record.lastSyncAt)}</td>
              <td>{record.lastError || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Guardar Datos de Contacto desde Panel

```tsx
// Cuando un comercial captura datos de un visitante
async function saveVisitorContactData(visitorId: string, contactInfo: ContactData) {
  const response = await fetch('/api/v1/leads/contact-data', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      visitorId,
      nombre: contactInfo.nombre,
      apellidos: contactInfo.apellidos,
      email: contactInfo.email,
      telefono: contactInfo.telefono,
      extractedFromChatId: currentChatId,
      additionalData: {
        marca_interes: contactInfo.marca,
        modelo_interes: contactInfo.modelo,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error guardando datos de contacto:', error);
    throw new Error(error.message);
  }

  return response.json();
}
```

---

## Flujo Automático de Sincronización

La sincronización con el CRM ocurre **automáticamente** cuando:

1. **Visitor cambia a LEAD**: Cuando el lifecycle del visitante cambia a `lead`, el sistema:
   - Busca si hay datos de contacto guardados
   - Verifica si hay configuración CRM activa para la empresa
   - Sincroniza automáticamente el lead al CRM

2. **Chat se cierra**: Si `syncChatConversations: true` en la configuración:
   - Al cerrar un chat, se sincroniza la conversación al CRM
   - Solo si el visitante ya está sincronizado como lead

```
Visitor lifecycle → LEAD
        │
        ▼
   ¿Hay CRM config?
        │
    Sí  │  No → fin
        ▼
   ¿Hay datos contacto?
        │
    Sí  │  No → warning log
        ▼
   Sincronizar a CRM
        │
        ▼
   Guardar SyncRecord
```

---

## Códigos de Error Comunes

| Código HTTP | Tipo | Descripción |
|-------------|------|-------------|
| 400 | `BAD_REQUEST` | Datos inválidos o CRM ya configurado |
| 401 | `UNAUTHORIZED` | Token inválido o expirado |
| 403 | `FORBIDDEN` | Sin permisos para esta operación |
| 404 | `NOT_FOUND` | Recurso no encontrado |
| 500 | `INTERNAL_ERROR` | Error interno del servidor |

---

## Tipos TypeScript

```typescript
// Tipos para el frontend

interface LeadContactData {
  id: string;
  visitorId: string;
  companyId: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string;
  dni?: string;
  poblacion?: string;
  additionalData?: Record<string, unknown>;
  extractedFromChatId?: string;
  extractedAt: string;
  updatedAt: string;
}

interface SaveContactDataRequest {
  visitorId: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string;
  dni?: string;
  poblacion?: string;
  additionalData?: Record<string, unknown>;
  extractedFromChatId?: string;
}

type CrmType = 'leadcars';

interface CrmCompanyConfig {
  id: string;
  companyId: string;
  crmType: CrmType;
  enabled: boolean;
  syncChatConversations: boolean;
  triggerEvents: string[];
  config: LeadCarsConfig;
  createdAt: string;
  updatedAt: string;
}

interface LeadCarsConfig {
  clienteToken: string;
  useSandbox?: boolean;
  concesionarioId?: number;
  sedeId?: number;
  campanaId?: number;
  tipoLeadDefault?: string;
}

interface CreateCrmConfigRequest {
  companyId: string;
  crmType: CrmType;
  enabled: boolean;
  syncChatConversations: boolean;
  triggerEvents: string[];
  config: LeadCarsConfig;
}

interface UpdateCrmConfigRequest {
  enabled?: boolean;
  syncChatConversations?: boolean;
  triggerEvents?: string[];
  config?: Partial<LeadCarsConfig>;
}

interface TestConnectionRequest {
  crmType: CrmType;
  config: LeadCarsConfig;
}

interface TestConnectionResponse {
  success: boolean;
  error?: string;
  validationErrors?: string[];
}

type SyncStatus = 'pending' | 'synced' | 'failed' | 'partial';

interface CrmSyncRecord {
  id: string;
  visitorId: string;
  companyId: string;
  crmType: CrmType;
  externalLeadId?: string;
  status: SyncStatus;
  lastSyncAt?: string;
  lastError?: string;
  retryCount: number;
  chatsSynced: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

---

## Checklist de Integración

### Panel de Administración
- [ ] Pantalla de configuración de CRM
- [ ] Selector de tipo de CRM (desde `/supported-crms`)
- [ ] Formulario específico por CRM (LeadCars)
- [ ] Botón de probar conexión
- [ ] Toggle de activar/desactivar
- [ ] Toggle de sincronizar conversaciones
- [ ] Vista de registros de sincronización
- [ ] Filtro de sincronizaciones fallidas
- [ ] Indicadores visuales de estado

### Gestión de Leads
- [ ] Formulario para capturar datos de contacto de visitante
- [ ] Visualización de datos de contacto existentes
- [ ] Integración con la vista de chat para captura rápida

---

## Soporte

Para dudas sobre la integración, contactar al equipo de backend o revisar la documentación de la API en Swagger: `/api/docs`
