# Arquitectura del Sistema LLM - Guiders Backend

## Vista General

```mermaid
flowchart TB
    subgraph ACCESS["🚪 PUNTOS DE ACCESO"]
        REST["REST API<br/>/v2/llm/*<br/>👤 Commercial/Admin"]
        WS["WebSocket<br/>Mensajes en tiempo real<br/>👥 Visitante"]
        EVENT["Event Bus<br/>MessageSentEvent<br/>⚡ Automático"]
    end

    subgraph APP["📦 CAPA DE APLICACIÓN"]
        CMD1["GenerateSuggestionCommand<br/>Genera 3 sugerencias"]
        CMD2["ImproveTextCommand<br/>Mejora redacción"]
        CMD3["GenerateAIResponseCommand<br/>Respuesta automática"]
        HANDLER["SendAIResponseOnMessageSent<br/>EventHandler"]
    end

    subgraph SERVICES["⚙️ SERVICIOS DE DOMINIO"]
        CONFIG["LlmCompanyConfig<br/>• aiAutoResponseEnabled<br/>• preferredModel<br/>• customSystemPrompt"]
        CONTEXT["ContextBuilder<br/>• Prompt base conversacional<br/>• Visitor info<br/>• Tools context<br/>• Response style"]
        TOOLS["ToolExecutor<br/>• fetch_page<br/>• Cache<br/>• Seguridad"]
    end

    subgraph PROVIDER["🤖 PROVEEDOR LLM"]
        GROQ["GROQ<br/>llama-3.3-70b-versatile<br/>Ultra low latency"]
    end

    REST --> CMD1
    REST --> CMD2
    WS --> EVENT
    EVENT --> HANDLER
    HANDLER --> CMD3

    CMD1 --> CONFIG
    CMD2 --> CONFIG
    CMD3 --> CONFIG

    CONFIG --> CONTEXT
    CONTEXT --> TOOLS
    TOOLS --> GROQ

    GROQ -->|"Respuesta"| CMD3
    GROQ -->|"Sugerencias"| CMD1
    GROQ -->|"Texto mejorado"| CMD2

    style ACCESS fill:#e1f5fe
    style APP fill:#fff3e0
    style SERVICES fill:#f3e5f5
    style PROVIDER fill:#e8f5e9
```

[🎨 Editar en Mermaid Playground](https://mermaidchart.com/play?utm_source=mermaid_mcp_server&utm_medium=remote_server&utm_campaign=claude#pako:eNp9VM1u00AQfpVVuCGF0EQRUKFKrmOKpSQ2cUiRCEIbe5wY1rvR7joQUSTeACEkJHqpQMCBKxfufRNegD4Cu-uf2qGqL_Z-M_PN-JvZedMKWQSt_VZM2KtwhblE08M5ReoR2WLJ8XqFLNt2guDpvHVxdvoT-Y_HUy9AAyfHvXnrWe6vn4kTTJWjfiHLd-8veOegs-l2CEk7N83p4uzDN2SzNAUeJph0rChNaIPjWKc6hkXAwpcgTdAIqMAvQCCgSCaQrhnigElJ-B3NEpFITCU0mJyZM9blOBugEh1moiATAi8hUJgxGPDP6RdkZZKl519kErKKBmg0p7t6-L4R4-MPZFu-ZaTwh65t2e75x3GjAns02FO-R0CBYwlBtlyCkAmjWgFMI5M7t6KeyrAEDlTpInZZuorFTdecbWAKr2U9fAQvmArnEOEwTM5_0d3YXq0Cy52AWDMqoE6hsUwVhhGuNMANmofWeDB0JopJ6RZdsni0JqfhMpo-VMwE-LUyBs5k5qoJUpx_Tj___f2-QNx8ugbeyB27zfGyvfED90gFDEmq6l9jurUZjZNl3sN3XxFOdBfL6hyKFwSiyrrmEANXSo3U0JMKDjOh_jrYCgmpzxWv3M06dZ7oQVLJpFL_MEtIBLyKz2PQAguosEMOm0RuUUKF5Fmoe17ZzLQyrmwxq8ApY0SgMM_QyD_1vKFWSXs4ryFUP3iZOwYZrp6vVQcqyMbh6vIUwDLjSYSja5vhT7yZOzANvjj79smcHWfgTdBwOGpUczTxHumBUi-TgxCc4nbvVq995_aivQEusExInv8xkWoy1WZBRM0eDbdX1WCWRbt9YC7L_1A3h44DA5grnSPm04DFcOZwcSjDe2UazZ6DZogqsHsV2GuABWxOpUFPRIXrgzGYVuWw-TSglqok0d8aPFFLsrx089ZJUemOR1DfByc1fWo-ehswlJodELHCrVv1V24JFAscxQkh-zdgL-7H0DD7fmGL47gHt-u28pKWDj3ox_26Qzk4JfvduA_3Wm__AQ96DMA)

---

## 1. Puntos de Entrada a la IA

### REST Endpoints

| Endpoint | Método | Roles | Descripción |
|----------|--------|-------|-------------|
| `/v2/llm/suggestions` | POST | commercial, admin | Genera 3 sugerencias de respuesta |
| `/v2/llm/improve` | POST | commercial, admin | Mejora redacción de texto |
| `/v2/llm/config/:companyId` | GET | admin | Obtiene configuración LLM |
| `/v2/llm/config` | POST | admin | Crea configuración |
| `/v2/llm/config/:companyId` | PATCH | admin | Actualiza configuración |
| `/v2/llm/config/providers` | GET | admin | Lista proveedores disponibles |

### Event-Driven (Automático)

El sistema responde automáticamente a mensajes de visitantes mediante eventos:

1. Visitante envía mensaje via WebSocket
2. Se publica `MessageSentEvent`
3. `SendAIResponseOnMessageSentEventHandler` captura el evento
4. Aplica filtros (no es IA, es visitante, shouldAutoRespond = true)
5. Ejecuta `GenerateAIResponseCommand`

---

## 2. Capas de Prompts

El system prompt se construye en **5 capas**, cada una añadiendo información:

```mermaid
flowchart TB
    subgraph LAYER1["🔵 CAPA 1: Prompt Base Conversacional"]
        BASE["DEFAULT_SYSTEM_PROMPT<br/>o<br/>customSystemPrompt de empresa<br/><i>Incluye estilo conversacional integrado</i>"]
    end

    subgraph LAYER2["🟢 CAPA 2: Contexto Visitante"]
        VISITOR["Información del Visitante:<br/>• Página actual<br/>• Etapa del funnel<br/>• Número de visitas<br/><i>Si includeVisitorInfo=true</i>"]
    end

    subgraph LAYER3["🟡 CAPA 3: Tool Use Instructions"]
        TOOLINST["USO DE HERRAMIENTAS:<br/>• Usa tools MÁXIMO 1 VEZ<br/>• Responde inmediatamente después<br/>• No llames múltiples veces<br/><i>Si hasToolsEnabled=true</i>"]
    end

    subgraph LAYER4["🟠 CAPA 4: Response Style Instruction"]
        RESPONSE["PROCESAMIENTO DE INFO WEB:<br/>• Extrae SOLO lo relevante<br/>• Resume en 1-2 oraciones<br/>• Pregunta aspectos específicos<br/><i>Si hasToolsEnabled=true</i>"]
    end

    subgraph LAYER5["🔴 CAPA 5: Historial"]
        HISTORY["conversationHistory<br/>Últimos 20 mensajes<br/>user/assistant alternados"]
    end

    LAYER1 --> LAYER2
    LAYER2 --> LAYER3
    LAYER3 --> LAYER4
    LAYER4 --> LAYER5
    LAYER5 --> LLM["🤖 Groq LLM"]

    style LAYER1 fill:#bbdefb
    style LAYER2 fill:#c8e6c9
    style LAYER3 fill:#fff9c4
    style LAYER4 fill:#ffe0b2
    style LAYER5 fill:#ffcdd2
```

[🎨 Editar en Mermaid Playground](https://mermaidchart.com/play?utm_source=mermaid_mcp_server&utm_medium=remote_server&utm_campaign=claude#pako:eNqtVEFu00AUvcpXWFdtnARRq0RKWpdaSuIodgqFoGpij1uj8YyZGYdGCAnugFiwKa3YsGAFbLr1TTgBR-DbTuOEdAESXkT2ezN_3nvzf17XfBHQmlkLmXjlnxOpwetOOOCj0umZJMk59Don1qj-bFL7dfn-B-x3hh2omzCUIk40dImisC_4jEpF_Ehwwia152WF_Ol2XAu3HliHnXHPO3VPXM_qnw5HTn_o7U3ldlsUv36qtIjdudI0XlQOKNA4kVSRYsVe1La5z9I5wkpHTIC_dipEXFMUHIi97ai91EB5MOF3GTIKQ5fXpSHDzE1oeqEFHEcq0gQ_1owc267tOSPcZfNQyBiPzb5xVMmqDWah9OfbaxhmV2cRJ0B8nRK2hC1NElLsCVPOaUUMspuYSpGbnhXV1K1pN0Jn6DugxTFC5sc_1DKlf-ezUfq8Kn02TPCEYDDGW7O5wjK-xvjUmlXPcXr2wPVw59h14MCCI2s06vRta-B13MrkWBHQWE1BP3v3xO47UIdj6-mSH1GVCI6WIh7TICKaxBRTQpMqSbMvqnIvgDEkFcTZDdNRwvB1Rn26msI5Ubl0ZXEyZTT4hwiaZQSfygia5kIYRuDqOVsLYi2HkeUOnUHRv9iw-5ZbRlAkYg8OHXhsdas0rAstCZZ0eg5gd0rK6CxvitU40hi7l0N9ywAhi8alVQpDSc9SrrFpVEJ9LRQ2Or5kX8PIF_8niVY5xd_LJFomHEU4dzL6Y2iPbBdb_QQX385Ynk25dl4IyT7iNcUo0dgBvFRFXiyMpIrKbaIUrkXzQJimkuNQqrvElf8ssLXVXszkCmxUcGMFblRwcwVuVnBrBW6VcK9f-P78AR5J8TL_LtQsEip6YCEljBgz702nAQ2nG7SxoP0H9L6_u0E3FnQYhrt-c4NuLmm6MzU26NaS9oPAqL35DRDH4cA)

### Descripción de cada capa

| Capa | Nombre | Condición | Contenido |
|------|--------|-----------|-----------|
| 1 | Prompt Base Conversacional | Siempre | `DEFAULT_SYSTEM_PROMPT` con estilo conversacional integrado (brevedad, preguntas de seguimiento) |
| 2 | Visitante | `includeVisitorInfo=true` | Página actual, etapa, visitas |
| 3 | Tool Use Instructions | `hasToolsEnabled=true` | Instrucciones para limitar uso de tools a 1 vez |
| 4 | Response Style Instruction | `hasToolsEnabled=true` | Cómo procesar info web: resumir, no listar todo, preguntar detalles |
| 5 | Historial | Siempre | Últimos 20 mensajes de la conversación |

---

## 3. Configuración por Empresa (LlmCompanyConfig)

```typescript
interface LlmCompanyConfig {
  // Control de Features
  aiAutoResponseEnabled: boolean;     // Responder automáticamente
  aiSuggestionsEnabled: boolean;      // Mostrar sugerencias a comerciales
  aiRespondWithCommercial: boolean;   // Responder si hay comercial asignado

  // Modelo y Proveedor
  preferredProvider: "groq";
  preferredModel: "llama-3.3-70b-versatile";

  // Personalización
  customSystemPrompt?: string;        // Prompt personalizado (opcional)

  // Parámetros de Generación
  maxResponseTokens: 500;
  temperature: 0.7;
  responseDelayMs: 1000;

  // Configuración de Tools
  toolConfig: {
    fetchPageEnabled: boolean;
    allowedPaths: string[];           // Rutas permitidas
    maxIterations: 3;
    cacheEnabled: true;
    cacheTtlSeconds: 3600;
  };
}
```

### Lógica de Decisión: shouldAutoRespond()

```mermaid
flowchart TD
    START((Mensaje<br/>recibido)) --> Q1{aiAutoResponse<br/>Enabled?}

    Q1 -->|NO| R1[❌ No responder]
    Q1 -->|SÍ| Q2{¿Tiene comercial<br/>asignado?}

    Q2 -->|NO| R2[✅ Responder<br/>siempre]
    Q2 -->|SÍ| Q3{aiRespondWith<br/>Commercial?}

    Q3 -->|SÍ| R3[✅ Responder<br/>junto con comercial]
    Q3 -->|NO| R4[❌ No responder<br/>comercial maneja]

    style START fill:#e3f2fd
    style R1 fill:#ffcdd2
    style R2 fill:#c8e6c9
    style R3 fill:#c8e6c9
    style R4 fill:#ffcdd2
    style Q1 fill:#fff9c4
    style Q2 fill:#fff9c4
    style Q3 fill:#fff9c4
```

[🎨 Editar en Mermaid Playground](https://mermaidchart.com/play?utm_source=mermaid_mcp_server&utm_medium=remote_server&utm_campaign=claude#pako:eNp1kcFOgzAYx1-lwct2WAyFGLeYmUU9OgMj8TA5lParK4F2KSzGwI7e9A30WUzmm-xJRECxU3ro5ff__b-vUFhUMbAmFk_UA10RnaPg8k6i6iyCmR8MBtcgMxLDWaSPpxqoiARTwyEajabIswsiZptc-ZCtlcya0JUkUQLsfNvUNLdnfxnl_KZEvr3cvz2juUK61hjo0AgtPl5K5OFi9x4IkICoSkFTQZK6nmTiXhKmDvpx14-X-9cn5H-X11YmIF1rCI10M8ipHtGGb0W-quMXKm1nHoxxOtF3_pkTb2Suqo1lt3VoqPWG7p8vUMs_CkqJhJhUZuNm-WMCzQ9BXCTJ5Agcjjn7TX27RZxTxrCBcIvoKZzQsYGcfuT2FnrdLD6mroFwP3IMZG0_AQTm0Pg)

---

## 4. Sistema de Tools (Function Calling)

### Tool: fetch_page

| Propiedad | Descripción |
|-----------|-------------|
| **Propósito** | Obtener contenido de páginas web del sitio de la empresa |
| **Parámetro** | `path`: Ruta relativa de la página (ej: `/pricing`) |
| **Seguridad** | Solo dominios de la empresa (whitelist) |
| **Cache** | Configurable, default 1 hora |
| **Timeout** | 10 segundos |

### Flujo de Tool Use

```mermaid
sequenceDiagram
    autonumber
    participant V as 👥 Visitante
    participant WS as 🔌 WebSocket
    participant EB as ⚡ EventBus
    participant EH as 📬 EventHandler
    participant CB as 🔧 ContextBuilder
    participant TE as 🛠️ ToolExecutor
    participant LLM as 🤖 Groq

    V->>WS: Envía mensaje
    WS->>WS: Persiste mensaje
    WS->>EB: Publica MessageSentEvent

    EB->>EH: Captura evento

    Note over EH: Filtros:<br/>✓ No es mensaje IA<br/>✓ Es de visitante<br/>✓ shouldAutoRespond()

    EH->>EH: Obtiene LlmCompanyConfig
    EH->>EH: Obtiene historial chat

    EH->>CB: buildContext()

    Note over CB: Construye prompt:<br/>1. Base conversacional<br/>2. Visitor info<br/>3. Tool use instruction<br/>4. Response style<br/>5. History

    CB-->>EH: LlmContext

    EH->>LLM: Primera llamada

    alt Tool Call (fetch_page)
        LLM-->>EH: tool_calls: fetch_page
        EH->>TE: Ejecutar fetch_page
        TE->>TE: Validar URL/path
        TE->>TE: HTTP GET + Cache
        TE-->>EH: Contenido web
        EH->>LLM: Segunda llamada con contexto
    end

    LLM-->>EH: Respuesta final

    EH->>EH: Crea mensaje IA
    EH->>WS: Emite a sala chat
    WS->>V: Recibe respuesta
```

[🎨 Editar en Mermaid Playground](https://mermaidchart.com/play?utm_source=mermaid_mcp_server&utm_medium=remote_server&utm_campaign=claude#pako:eNp1k89u00AQxl9llFMRair-XSJUqTamQUqhakxyqVSN7UmyZb2b7q5Do4o3QEKoiAMgARKIC9y58yZ9AXgExms7TanxIVL2-3lnvm_GZ51UZ9TpdSydFKRSeiBwajA_VMAPFk6rIk_IVP_naJxIxRyVgxGghT8fX3-FkbDC8RFdh8bDinrzEsaUDHX6jNx1KgpK6uLdZ4gWpFxQ2BamX910_r2C-qgy2dZXGNQlv0GoualTvk_IrA2Nowp9_-n3z1cQay2jU0rZcws7GOxV8Je3sGv0yaGqmNHm9vZ42INILX79QMhJWTyukxgPa3GfjBXWUYscBSwXiRQpwh5Zi1Masj3vsakRBSXY70GIc1cYBCpVXYnV72PNt-sFGSi5h0I6o23vfmK2ti8-nLMMZJvq8GhnJUQWMoJFM8HVuZ3pQmY7nMUB2blW2caNVTf9upsniROkCAYyD3XOKS058ImY_gebcQLaCJSQztCtN-_RkINIyknVUysLtvkrOUasM8WSYG64squM3upCgJa2woIL5bXkldusGFoItwTh30yd0MpLd7rV_mrD0kT7s7tdvwwW0qoVf3ivC33vYNkEEQabtUWfgEevhMQ7w8M1IieemZSYY4YNgNL5IjxTKWFjQi6dHc15-rXt8uH3mwqO0aOUUduDS_YS9fXiiPfwuNxgNK1UHNXUCKXIGHp6MNiao5u1IP043ofdKIab3GI6u3pLs4-laSUyDc8p-acZb35I00JlK_NloE2o9fqSyppI1uyWS1eQdQgToVBeW73QEK6t85rqv8Vc8LYgWJS4tmz-exuVl6ciITBNjc6Lv9mnqFQ)

### Control de Tool Use y Mecanismo de Fallback

Para evitar loops infinitos de tool calling, el sistema implementa:

1. **Instrucciones de Límite**: El system prompt incluye instrucciones para usar tools MÁXIMO 1 vez por pregunta
2. **maxIterations**: Límite configurado (default: 3) en `toolConfig`
3. **Fallback**: Cuando se alcanza `maxIterations`, se fuerza respuesta sin tools

```mermaid
flowchart TD
    START((Mensaje<br/>visitante)) --> CHECK{hasToolsEnabled?}

    CHECK -->|NO| SIMPLE["Respuesta simple<br/>sin tools"]
    CHECK -->|SÍ| LOOP["Iniciar Tool Loop<br/>iteration = 0"]

    LOOP --> CALL["Llamar LLM con tools<br/>toolChoice: auto"]
    CALL --> RESULT{¿Respuesta?}

    RESULT -->|"Texto final"| SUCCESS["✅ Respuesta<br/>generada"]
    RESULT -->|"tool_calls"| EXEC["Ejecutar tool<br/>fetch_page_content"]

    EXEC --> INC["iteration++"]
    INC --> MAXCHECK{iteration<br/>≥ maxIterations?}

    MAXCHECK -->|NO| CALL
    MAXCHECK -->|SÍ| FALLBACK["⚠️ FALLBACK<br/>Llamar LLM SIN tools<br/>toolChoice: none"]

    FALLBACK --> FORCE["Forzar respuesta<br/>con info disponible"]
    FORCE --> SUCCESS

    SIMPLE --> SUCCESS

    style START fill:#e3f2fd
    style SUCCESS fill:#c8e6c9
    style FALLBACK fill:#fff3e0
    style FORCE fill:#ffe0b2
```

[🎨 Editar en Mermaid Playground](https://mermaidchart.com/play?utm_source=mermaid_mcp_server&utm_medium=remote_server&utm_campaign=claude#pako:eNp1U8tu00AU_ZWR2bSqKqJWQhBBUTCOsDpJqtiVKmEUTcbXzVSTGcszgZakSxYsEHvEgg3_wA4J_qQ_wC8wj2SII-qFZc2559x77hkvIypLiLpRxeU7OiONRvnLQiDzZHlvnO_tDUAocgVPp83Dk7dMMU2Ehv19dHh4guJXSXy6nBGVS8lVIsiUQ_n81vP925XY4tVwtEJZOjjDyesiGoOqF6A0QYrNa-7lFRNIW6UierPLzn5_WiE8Gp0ZcioYZaRBtivCUtaOzTQ0RDMp0DPUCQr-bYl-4h7GRgFzMjcCGA8QleumTsR-xTPJKHQRWWj5bxJDdArjJDvH-fLXz2ChbdjjbuYiyuFaS1QxQXgRGfvncZxkmRng7usHFARc50sQZv6ShI4tITvXhBJud7NCyUUSG5HkCuhCGx8WdSIVaDqb1OQSJsaXBqF3FmGZzkY6tAphZwcHodAgrmLQu_D5hiLX4u7jdzQn1-nmULXtb1ghcru4_0Auz77BXvTiU7uQL9_-_PgcTlyrrZSydHhPSkIK2DG5EXE2-qNxbG9cXzbvjVjTWroNn4lKopKpWgpm7m_QckQnsY5tu4W_yPehSt9w8D-QCZ_z7gM4ro6qsoV62hqnj-ERfbKNBxO-oKqqY-i0Ctx8GxQ606Po9i816jJz)

---

## 5. Proveedor LLM: Groq

### Modelos Disponibles

| Modelo | Parámetros | Uso Recomendado |
|--------|------------|-----------------|
| `llama-3.3-70b-versatile` (DEFAULT) | 70B | General |
| `llama-3.1-8b-instant` | 8B | Respuestas rápidas |
| `meta-llama/llama-4-scout-17b` | 17B | Equilibrado |
| `meta-llama/llama-4-maverick-17b` | 17B | Tareas complejas |
| `qwen/qwen3-32b` | 32B | Razonamiento |
| `moonshotai/kimi-k2-instruct` | - | Instrucciones |

### Características de Groq

- Latencia ultra baja (especialidad de Groq)
- Soporte completo de function calling
- Context window hasta 128k tokens

---

## 6. Estructura de Archivos

```text
src/context/llm/
│
├── domain/
│   ├── services/
│   │   ├── llm-provider.service.ts         # Interface proveedor
│   │   ├── llm-context-builder.service.ts  # Interface contexto
│   │   └── tool-executor.service.ts        # Interface tools
│   │
│   ├── value-objects/
│   │   ├── llm-company-config.ts           # Config por empresa
│   │   ├── llm-context.ts                  # Contexto para LLM
│   │   ├── llm-response.ts                 # Respuesta del LLM
│   │   └── tool-config.ts                  # Config de tools
│   │
│   ├── llm-config.repository.ts            # Interface repositorio
│   └── errors/llm.error.ts                 # Errores de dominio
│
├── application/
│   ├── commands/
│   │   ├── generate-ai-response.command-handler.ts    # Respuesta auto
│   │   ├── generate-suggestion.command-handler.ts     # Sugerencias
│   │   └── improve-text.command-handler.ts            # Mejorar texto
│   │
│   ├── events/
│   │   └── send-ai-response-on-message-sent.event-handler.ts
│   │
│   └── dtos/
│       ├── llm-config.dto.ts
│       └── ai-response.dto.ts
│
├── infrastructure/
│   ├── controllers/
│   │   ├── llm-config.controller.ts        # REST /v2/llm/config/*
│   │   └── llm-suggestions.controller.ts   # REST /v2/llm/suggestions
│   │
│   ├── providers/
│   │   └── groq-llm-provider.service.ts    # Implementación Groq
│   │
│   ├── services/
│   │   ├── llm-context-builder.service.impl.ts
│   │   └── tool-executor.service.impl.ts
│   │
│   └── persistence/
│       └── mongo-llm-config.repository.impl.ts
│
└── llm.module.ts
```

---

## 7. Archivos Clave Modificados (Instructions)

Los siguientes archivos contienen instrucciones que modifican el comportamiento del LLM:

### `llm-context-builder.service.impl.ts` - Prompt Base Conversacional

El `DEFAULT_SYSTEM_PROMPT` incluye instrucciones de estilo conversacional integradas:

```typescript
private readonly DEFAULT_SYSTEM_PROMPT = `Eres un asistente virtual de atención al cliente profesional y amable.
Tu objetivo es ayudar a los visitantes del sitio web manteniendo una conversación natural y fluida.

ESTILO DE RESPUESTA:
- Responde ÚNICAMENTE a la pregunta específica del visitante
- Usa 1-2 oraciones máximo para responder
- SIEMPRE resume la información, aunque sea importante (precios, horarios, etc.)
- Si hay mucha información, da un resumen breve y pregunta si quiere más detalles
- Haz preguntas de seguimiento cuando tenga sentido (no en despedidas o confirmaciones)
- NO listes toda la información disponible - solo lo mínimo necesario
- Sé conversacional, no informativo

REGLAS:
- Responde siempre en español de manera profesional pero cercana
- Si no conoces la respuesta, indica que un comercial humano puede ayudar
- Sugiere "hablar con un agente" si la consulta es muy compleja o requiere información confidencial
- No inventes información sobre productos, precios o disponibilidad
- Si el visitante saluda, responde brevemente y pregunta en qué puedes ayudar`;

// En buildContext():
const systemPrompt = params.customSystemPrompt || this.DEFAULT_SYSTEM_PROMPT;
```

### `generate-ai-response.command-handler.ts` - Tool Use Instruction

```typescript
private readonly TOOL_USE_INSTRUCTION = `

USO DE HERRAMIENTAS:
- Puedes usar la herramienta fetch_page_content para obtener información del sitio web
- Usa la herramienta MÁXIMO UNA VEZ por pregunta del usuario
- Después de obtener información con la herramienta, DEBES responder inmediatamente al usuario
- NO llames a la herramienta múltiples veces - usa la información que ya obtuviste
- Si la información obtenida no es suficiente, responde con lo que tienes y sugiere que el usuario pregunte algo más específico`;
```

### `generate-ai-response.command-handler.ts` - Response Style Instruction (NUEVO)

```typescript
private readonly RESPONSE_STYLE_INSTRUCTION = `

PROCESAMIENTO DE INFORMACIÓN WEB:
- Cuando obtengas información de páginas web, EXTRAE SOLO lo relevante para la pregunta actual
- NUNCA copies ni listes todo el contenido de la página
- Da un resumen muy breve (1-2 oraciones) y ofrece ampliar si lo necesita
- Si hay precios, horarios u otros datos, resume: "Tenemos opciones desde X€" en lugar de listar todo
- Pregunta qué aspecto específico le interesa para dar información más precisa

EJEMPLOS DE RESPUESTAS CORRECTAS:
- Pregunta: "¿Qué productos tienen?" → "Tenemos electrónica, hogar y deportes. ¿Qué categoría te interesa?"
- Pregunta: "¿Cuáles son los precios?" → "Los precios varían según el producto. ¿Qué artículo te interesa para darte el precio exacto?"
- Pregunta: "¿Tienen horarios?" → "Sí, estamos abiertos de lunes a sábado. ¿Quieres saber el horario de algún día en concreto?"`;

// En generateWithTools():
const enrichedSystemPrompt = systemPrompt + this.TOOL_USE_INSTRUCTION + this.RESPONSE_STYLE_INSTRUCTION;
```

### `generate-ai-response.command-handler.ts` - Fallback Mechanism

```typescript
// Cuando se alcanza maxIterations, se fuerza respuesta sin tools:
const finalResult = await this.llmProvider.generateCompletionWithTools({
  systemPrompt: enrichedSystemPrompt +
    '\n\nIMPORTANTE: Ya has consultado suficiente información. Ahora DEBES responder al usuario con la información que tienes disponible. NO solicites más información.',
  messages,
  maxTokens: config.maxResponseTokens,
  temperature: config.temperature,
  tools: [],           // Sin tools para forzar respuesta de texto
  toolChoice: 'none',  // Forzar respuesta sin tool calls
});
```

---

## 8. Referencias

- **Contexto LLM**: `src/context/llm/`
- **Event Handler**: `src/context/llm/application/events/send-ai-response-on-message-sent.event-handler.ts`
- **Context Builder**: `src/context/llm/infrastructure/services/llm-context-builder.service.impl.ts`
- **Groq Provider**: `src/context/llm/infrastructure/providers/groq-llm-provider.service.ts`
