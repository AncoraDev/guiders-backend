# LLM Tool Use - Herramientas Automáticas de la IA

## Descripción

El sistema de **Tool Use** (Function Calling) permite que el LLM ejecute acciones automáticamente durante una conversación con un visitante. Las herramientas disponibles son:

| Tool | Descripción |
|------|-------------|
| `fetch_page_content` | Obtiene contenido del sitio web para responder preguntas |
| `save_lead_contact_data` | Guarda datos de contacto y crea leads automáticamente |

Cuando un visitante pregunta sobre productos, servicios, precios u otra información del negocio, el LLM puede invocar herramientas para obtener el contenido real de la web y generar respuestas precisas y actualizadas.

Cuando un visitante proporciona sus datos de contacto (nombre, email, teléfono), el LLM puede guardarlos automáticamente, convirtiendo al visitante en un **lead** que se sincroniza con el CRM.

---

## Flujo de Funcionamiento

```
┌─────────────────────────────────────────────────────────────────┐
│  Visitante: "¿Cuáles son vuestros productos?"                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM analiza la pregunta                                        │
│  → Decide que necesita información de la web                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM invoca: fetch_page_content({ path: "/productos" })         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend obtiene contenido via Jina Reader API                  │
│  → Convierte HTML a Markdown limpio                             │
│  → Cachea resultado (1 hora por defecto)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM genera respuesta con información real del sitio            │
│  "Ofrecemos los siguientes productos: ..."                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuración via API

### Endpoint

```
PATCH /v2/llm/config/:siteId
```

### Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

### Roles Requeridos

- `admin`
- `superadmin`

---

## Habilitar Tool Use

### Request Mínimo

```bash
curl -X PATCH https://api.guiders.com/v2/llm/config/SITE_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "aiAutoResponseEnabled": true,
    "toolConfig": {
      "fetchPageEnabled": true
    }
  }'
```

### Request Completo

```bash
curl -X PATCH https://api.guiders.com/v2/llm/config/SITE_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "aiAutoResponseEnabled": true,
    "toolConfig": {
      "fetchPageEnabled": true,
      "allowedPaths": ["/productos", "/servicios", "/contacto", "/precios"],
      "maxIterations": 3,
      "fetchTimeoutMs": 10000,
      "cacheEnabled": true,
      "cacheTtlSeconds": 3600
    }
  }'
```

### Response

```json
{
  "siteId": "550e8400-e29b-41d4-a716-446655440000",
  "companyId": "550e8400-e29b-41d4-a716-446655440001",
  "aiAutoResponseEnabled": true,
  "aiSuggestionsEnabled": false,
  "aiRespondWithCommercial": false,
  "preferredProvider": "groq",
  "preferredModel": "llama-3.3-70b-versatile",
  "customSystemPrompt": null,
  "maxResponseTokens": 500,
  "temperature": 0.7,
  "responseDelayMs": 1000,
  "toolConfig": {
    "fetchPageEnabled": true,
    "allowedPaths": [],
    "maxIterations": 3,
    "fetchTimeoutMs": 10000,
    "cacheEnabled": true,
    "cacheTtlSeconds": 3600
  },
  "createdAt": "2025-12-08T10:00:00.000Z",
  "updatedAt": "2025-12-08T10:30:00.000Z"
}
```

---

## Parámetros de toolConfig

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `fetchPageEnabled` | boolean | `false` | Habilita el fetch de páginas web |
| `saveLeadContactEnabled` | boolean | `false` | Habilita guardar datos de contacto de leads |
| `allowedPaths` | string[] | `[]` | Rutas permitidas (vacío = todas) |
| `maxIterations` | number | `3` | Máximo de tool calls por conversación (1-10) |
| `fetchTimeoutMs` | number | `10000` | Timeout para fetch en ms (1000-30000) |
| `cacheEnabled` | boolean | `true` | Habilita cache de contenido |
| `cacheTtlSeconds` | number | `3600` | TTL del cache en segundos (60-86400) |

---

## Tool Disponible: fetch_page_content

### Descripción

El LLM puede invocar esta herramienta para obtener el contenido de cualquier página del sitio web del comercial.

### Definición

```json
{
  "type": "function",
  "function": {
    "name": "fetch_page_content",
    "description": "Obtiene el contenido de una página del sitio web del comercial. Usar cuando necesites información específica sobre productos, servicios, precios, contacto, horarios, ubicación, etc.",
    "parameters": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string",
          "description": "Ruta relativa de la página (ej: /productos, /servicios, /contacto, /precios, /nosotros)"
        }
      },
      "required": ["path"]
    }
  }
}
```

### Ejemplo de Invocación (interno)

```json
{
  "id": "call_abc123",
  "type": "function",
  "function": {
    "name": "fetch_page_content",
    "arguments": "{\"path\": \"/productos\"}"
  }
}
```

### Resultado

El contenido de la página se convierte a Markdown limpio y se devuelve al LLM:

```markdown
# Nuestros Productos

## Categoría A
- Producto 1: Descripción del producto...
- Producto 2: Descripción del producto...

## Categoría B
- Producto 3: Descripción del producto...

## Precios
Consulta nuestra sección de precios para más información.
```

---

## Tool Disponible: save_lead_contact_data

### Descripción

Permite al LLM guardar automáticamente los datos de contacto que un visitante proporciona durante la conversación. Cuando el visitante comparte su nombre, email, teléfono u otros datos, el LLM puede invocar esta herramienta para:

1. **Guardar los datos de contacto** en el sistema
2. **Convertir automáticamente al visitor a LEAD** (si hay email o teléfono)
3. **Disparar sincronización con CRM** (LeadCars) si está configurado

### Definición

```json
{
  "type": "function",
  "function": {
    "name": "save_lead_contact_data",
    "description": "Guarda los datos de contacto del visitante cuando te los proporcione durante la conversación. Usa esta herramienta cuando el usuario te dé su nombre, email, teléfono, DNI u otros datos de contacto. Esto permite hacer seguimiento comercial del lead. Solo usa esta herramienta cuando el usuario haya proporcionado voluntariamente sus datos.",
    "parameters": {
      "type": "object",
      "properties": {
        "nombre": {
          "type": "string",
          "description": "Nombre del visitante"
        },
        "apellidos": {
          "type": "string",
          "description": "Apellidos del visitante"
        },
        "email": {
          "type": "string",
          "description": "Email del visitante"
        },
        "telefono": {
          "type": "string",
          "description": "Número de teléfono del visitante (con o sin prefijo)"
        },
        "dni": {
          "type": "string",
          "description": "DNI o documento de identidad del visitante"
        },
        "poblacion": {
          "type": "string",
          "description": "Ciudad o población del visitante"
        }
      }
    }
  }
}
```

### Ejemplo de Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│  Visitante: "Me llamo Juan García, mi email es juan@email.com"  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM detecta datos de contacto en el mensaje                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM invoca: save_lead_contact_data({                           │
│    nombre: "Juan",                                               │
│    apellidos: "García",                                          │
│    email: "juan@email.com"                                       │
│  })                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend:                                                        │
│  1. Guarda datos en LeadContactData                             │
│  2. Convierte visitor a LEAD                                     │
│  3. Emite VisitorLifecycleChangedEvent                          │
│  4. Sincroniza con LeadCars (si configurado)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM responde: "Gracias Juan, he registrado tus datos..."       │
└─────────────────────────────────────────────────────────────────┘
```

### Ejemplo de Invocación (interno)

```json
{
  "id": "call_xyz789",
  "type": "function",
  "function": {
    "name": "save_lead_contact_data",
    "arguments": "{\"nombre\": \"Juan\", \"apellidos\": \"García\", \"email\": \"juan@email.com\"}"
  }
}
```

### Resultado

El LLM recibe confirmación de los datos guardados:

```
Datos de contacto guardados correctamente. Campos guardados: nombre: Juan, apellidos: García, email: juan@email.com. El visitante será sincronizado con el CRM automáticamente.
```

### Habilitar save_lead_contact_data

```bash
curl -X PATCH /v2/llm/config/SITE_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "aiAutoResponseEnabled": true,
    "toolConfig": {
      "saveLeadContactEnabled": true
    }
  }'
```

### Habilitar ambas tools

```bash
curl -X PATCH /v2/llm/config/SITE_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "aiAutoResponseEnabled": true,
    "toolConfig": {
      "fetchPageEnabled": true,
      "saveLeadContactEnabled": true
    }
  }'
```

### Consideraciones de Privacidad

- La IA solo debe guardar datos proporcionados **voluntariamente** por el visitante
- No debe solicitar activamente datos personales a menos que sea necesario para el servicio
- El visitante debe haber dado consentimiento previo (gestionado por el sistema de consentimientos)

---

## Seguridad

### Validación de Dominios

Solo se permite fetch a:
- `canonicalDomain` del sitio
- `domainAliases` configurados

Cualquier intento de acceder a dominios externos es bloqueado.

### Sanitización de Paths

Se previenen ataques de path traversal:

```
✓ /productos          → Permitido
✓ /servicios/web      → Permitido
✗ ../etc/passwd       → Bloqueado
✗ /../../root         → Bloqueado
✗ javascript://alert  → Bloqueado
```

### Rate Limiting

- Máximo de `maxIterations` (default: 3) tool calls por conversación
- Previene loops infinitos y abuso de recursos

### Timeout

- Default: 10 segundos por request
- Configurable entre 1-30 segundos
- Previene bloqueos por páginas lentas

### Límite de Contenido

- El contenido se trunca a ~30,000 caracteres antes de enviar al LLM
- Se indica al LLM si el contenido fue truncado

---

## Cache

### Funcionamiento

El contenido obtenido se cachea en MongoDB con TTL configurable:

```javascript
{
  url: "https://example.com/productos",
  content: "# Productos...",
  fetchedAt: ISODate("2025-12-08T10:00:00Z"),
  expiresAt: ISODate("2025-12-08T11:00:00Z")  // TTL 1 hora
}
```

### Beneficios

1. **Rendimiento**: Respuestas más rápidas para páginas ya visitadas
2. **Ahorro**: Reduce llamadas a Jina Reader API
3. **Consistencia**: Mismo contenido durante el TTL

### Configuración

```json
{
  "cacheEnabled": true,
  "cacheTtlSeconds": 3600
}
```

---

## Jina Reader API

El sistema usa [Jina Reader](https://r.jina.ai/) para convertir páginas web a Markdown:

### Características

- Convierte HTML a Markdown limpio
- Elimina JavaScript, CSS y elementos no relevantes
- Extrae contenido principal de la página
- No requiere API key para uso básico

### Uso Interno

```typescript
const jinaUrl = `https://r.jina.ai/${encodeURIComponent(fullUrl)}`;
const response = await axios.get(jinaUrl, {
  timeout: 10000,
  headers: {
    'Accept': 'text/markdown',
    'User-Agent': 'Guiders-Bot/1.0'
  }
});
```

---

## Ejemplos de Uso

### 1. Habilitar Tool Use (mínimo)

```bash
curl -X PATCH /v2/llm/config/SITE_ID \
  -d '{"toolConfig": {"fetchPageEnabled": true}}'
```

### 2. Restringir a rutas específicas

```bash
curl -X PATCH /v2/llm/config/SITE_ID \
  -d '{
    "toolConfig": {
      "fetchPageEnabled": true,
      "allowedPaths": ["/productos", "/precios"]
    }
  }'
```

### 3. Deshabilitar cache (para desarrollo)

```bash
curl -X PATCH /v2/llm/config/SITE_ID \
  -d '{
    "toolConfig": {
      "fetchPageEnabled": true,
      "cacheEnabled": false
    }
  }'
```

### 4. Aumentar timeout para páginas lentas

```bash
curl -X PATCH /v2/llm/config/SITE_ID \
  -d '{
    "toolConfig": {
      "fetchPageEnabled": true,
      "fetchTimeoutMs": 20000
    }
  }'
```

### 5. Deshabilitar Tool Use

```bash
curl -X PATCH /v2/llm/config/SITE_ID \
  -d '{"toolConfig": {"fetchPageEnabled": false}}'
```

---

## Obtener Configuración Actual

```bash
curl -X GET /v2/llm/config/SITE_ID \
  -H "Authorization: Bearer TOKEN"
```

---

## Troubleshooting

### El LLM no usa las tools

1. Verificar que `fetchPageEnabled: true`
2. Verificar que `aiAutoResponseEnabled: true`
3. Revisar logs del backend para errores

### Timeout en fetch

1. Aumentar `fetchTimeoutMs`
2. Verificar que el sitio web responde correctamente
3. Verificar conectividad con Jina Reader

### Contenido incorrecto

1. Verificar que la URL del sitio es correcta
2. Probar la URL manualmente en `https://r.jina.ai/URL`
3. Verificar que el contenido no está protegido por JavaScript

### Cache no funciona

1. Verificar que `cacheEnabled: true`
2. Revisar colección `web_content_cache` en MongoDB
3. Verificar TTL con `cacheTtlSeconds`

---

## Arquitectura Técnica

```
┌─────────────────────────────────────────────────────────────────┐
│                 GenerateAIResponseCommandHandler                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Tool Use Loop (max N iter)                │  │
│  │                                                            │  │
│  │  1. Llamar Groq con tools definidas                       │  │
│  │  2. Si finish_reason == 'tool_calls':                     │  │
│  │     → Ejecutar tools via ToolExecutorService              │  │
│  │     → Agregar resultados al contexto                      │  │
│  │     → Volver a paso 1                                     │  │
│  │  3. Si finish_reason == 'stop':                           │  │
│  │     → Devolver respuesta final                            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│GroqLlmProvider   │  │ToolExecutorSvc   │  │WebContentFetcher │
│(tools parameter) │  │(orchestrator)    │  │(Jina Reader API) │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                               │                     │
               ┌───────────────┴───────────┐         ▼
               ▼                           ▼  ┌──────────────────┐
    ┌──────────────────┐        ┌──────────────────┐            │
    │ CommandBus       │        │ MongoDB Cache    │◄───────────┘
    │ (save_lead)      │        │ (TTL Index)      │
    └──────────────────┘        └──────────────────┘
               │
               ▼
    ┌──────────────────┐
    │ LeadsModule      │
    │ (SaveLeadCmd)    │
    └──────────────────┘
               │
               ▼
    ┌──────────────────┐
    │ CRM Sync         │
    │ (LeadCars)       │
    └──────────────────┘
```

### Archivos Clave

| Archivo | Descripción |
|---------|-------------|
| `llm/domain/tool-definitions/` | Interfaces y tipos de tools |
| `llm/domain/value-objects/tool-config.ts` | Value Object de configuración |
| `llm/infrastructure/services/tool-executor.service.impl.ts` | Orquestador de tools |
| `llm/infrastructure/services/web-content-fetcher.service.ts` | Integración Jina Reader |
| `llm/infrastructure/schemas/web-content-cache.schema.ts` | Schema MongoDB cache |
| `llm/application/commands/generate-ai-response.command-handler.ts` | Loop de tool use |
| `leads/application/commands/save-lead-contact-data-command.handler.ts` | Handler que guarda datos y convierte a LEAD |

---

## Limitaciones

1. **Solo HTTP/HTTPS**: No soporta otros protocolos
2. **Contenido público**: No puede acceder a contenido protegido por login
3. **JavaScript rendering**: No ejecuta JavaScript (usa el HTML estático)
4. **Tamaño**: Contenido truncado a ~30,000 caracteres
5. **Rate limits**: Jina Reader puede tener límites de uso

---

## Próximas Mejoras (Roadmap)

- [x] ~~Soporte para múltiples tools~~ ✅ Implementado (`fetch_page_content`, `save_lead_contact_data`)
- [ ] Métricas de uso de tools por sitio
- [ ] Configuración de tools desde panel de administración
- [ ] Soporte para sitios con JavaScript rendering (Puppeteer)
- [ ] Tools adicionales: búsqueda interna, FAQs, gestión de citas
