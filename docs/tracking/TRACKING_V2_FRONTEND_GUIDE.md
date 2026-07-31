# Guía de Integración - Sistema de Tracking V2

## Introducción

El sistema de Tracking V2 permite capturar y analizar eventos de interacción de usuarios en tu sitio web. Utiliza un sistema optimizado de batching, throttling y agregación para manejar grandes volúmenes de eventos de manera eficiente.

## Características Principales

- **Batching Automático**: Envía múltiples eventos en una sola petición (máximo 500 eventos)
- **Throttling Inteligente**: Descarta eventos de alta frecuencia de manera probabilística
- **Agregación**: Consolida eventos duplicados automáticamente
- **Particionamiento Temporal**: Almacenamiento optimizado por mes
- **Tipos de Eventos Extensibles**: Define eventos personalizados según tus necesidades

## Endpoints Disponibles

### Base URL
```
https://api.tudominio.com
```

### 1. Obtener Metadatos del Sitio (GET) - NUEVO
```
GET /pixel/metadata?apiKey={tu-api-key}
```

**Descripción**: Obtiene `tenantId` y `siteId` necesarios para el tracking basándose en tu API Key.

**Parámetros**:
- `apiKey` (query, requerido): Tu API Key pública

**Response**:
```typescript
{
  "tenantId": "uuid-v4",  // UUID del tenant (empresa)
  "siteId": "uuid-v4",    // UUID del sitio
  "domain": "example.com" // Dominio del sitio
}
```

**Ejemplo**:
```javascript
const response = await fetch('https://api.tudominio.com/pixel/metadata?apiKey=12ca17b4...8fd4071a0');
const { tenantId, siteId } = await response.json();
```

### 2. Ingerir Eventos (POST)
```
POST /tracking-v2/events
```

### 3. Obtener Estadísticas (GET)
```
GET /tracking-v2/stats/tenant/:tenantId
```

### 4. Health Check (GET)
```
GET /tracking-v2/health
```

---

## Tipos de Eventos Soportados

### Eventos Predefinidos

| Tipo | Descripción | Frecuencia | Prioridad |
|------|-------------|------------|-----------|
| `PAGE_VIEW` | Vista de página | Normal | Alta (100% conservado) |
| `CLICK` | Clic en elemento | Normal | Media |
| `SCROLL` | Scroll en página | Alta | Baja (10% conservado) |
| `MOUSE_MOVE` | Movimiento del mouse | Muy Alta | Muy Baja (1% conservado) |
| `FORM_SUBMIT` | Envío de formulario | Normal | Crítica (100% conservado) |
| `FORM_FIELD_FOCUS` | Focus en campo | Normal | Media |
| `VIDEO_PLAY` | Reproducir video | Normal | Media |
| `VIDEO_PAUSE` | Pausar video | Normal | Media |
| `VIDEO_COMPLETE` | Video completado | Normal | Alta |
| `FILE_DOWNLOAD` | Descarga de archivo | Normal | Alta |
| `LINK_CLICK` | Clic en enlace | Normal | Media |
| `BUTTON_CLICK` | Clic en botón | Normal | Media |
| `PRODUCT_VIEW` | Vista de producto | Normal | Crítica (100% conservado) |
| `ADD_TO_CART` | Añadir al carrito | Normal | Crítica (100% conservado) |
| `SEARCH` | Búsqueda realizada | Normal | Crítica (100% conservado) |

### Eventos Personalizados

Puedes definir cualquier tipo de evento usando una cadena personalizada:

```javascript
{
  eventType: 'CUSTOM_NEWSLETTER_SIGNUP',
  eventType: 'PREMIUM_FEATURE_USED',
  eventType: 'HELP_BUTTON_CLICKED',
  // etc.
}
```

---

## Estructura de Datos

### Request Body - Ingestar Eventos

```typescript
interface IngestTrackingEventsBatchDto {
  tenantId: string;      // UUID de tu empresa/tenant
  siteId: string;        // UUID del sitio web
  events: TrackingEventDto[];
}

interface TrackingEventDto {
  visitorId: string;     // UUID del visitante (generado por tu frontend)
  sessionId: string;     // UUID de la sesión actual
  eventType: string;     // Tipo de evento (ver tabla arriba)
  metadata: Record<string, any>;  // Datos adicionales del evento
  occurredAt?: string;   // Timestamp ISO 8601 (opcional, usa fecha actual si se omite)
}
```

### Response - Ingestar Eventos

```typescript
interface IngestEventsResponseDto {
  success: boolean;         // true si la ingesta fue exitosa
  received: number;         // Cantidad de eventos recibidos
  processed: number;        // Cantidad de eventos procesados
  discarded: number;        // Cantidad descartada por throttling
  aggregated: number;       // Tamaño actual del buffer
  message: string;          // Mensaje descriptivo
  processingTimeMs: number; // Tiempo de procesamiento en ms
}
```

---

## Implementación - JavaScript/TypeScript

### Opción 1: Cliente Básico (Vanilla JavaScript)

```javascript
class TrackingClient {
  constructor(config) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.tenantId = null;
    this.siteId = null;
    this.visitorId = this.getOrCreateVisitorId();
    this.sessionId = this.getOrCreateSessionId();
    this.eventQueue = [];
    this.maxBatchSize = 500;
    this.flushInterval = 5000; // 5 segundos
    this.initialized = false;

    // Inicializar obteniendo metadatos
    this.initialize();
  }

  // Obtener metadatos del sitio (tenantId y siteId)
  async initialize() {
    try {
      const response = await fetch(`${this.apiUrl}/pixel/metadata?apiKey=${this.apiKey}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status}`);
      }

      const metadata = await response.json();
      this.tenantId = metadata.tenantId;
      this.siteId = metadata.siteId;
      this.initialized = true;

      console.log('[TrackingClient] Initialized with tenantId:', this.tenantId, 'siteId:', this.siteId);

      // Iniciar auto-flush después de obtener metadatos
      this.startAutoFlush();
    } catch (error) {
      console.error('[TrackingClient] Failed to initialize:', error);
      throw error;
    }
  }

  // Esperar a que se complete la inicialización
  async waitForInitialization(timeout = 10000) {
    const startTime = Date.now();
    while (!this.initialized && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!this.initialized) {
      throw new Error('[TrackingClient] Initialization timeout');
    }
  }

  // Generar o recuperar visitorId de localStorage
  getOrCreateVisitorId() {
    let visitorId = localStorage.getItem('guiders_visitor_id');
    if (!visitorId) {
      visitorId = this.generateUUID();
      localStorage.setItem('guiders_visitor_id', visitorId);
    }
    return visitorId;
  }

  // Generar sessionId nuevo cada sesión
  getOrCreateSessionId() {
    let sessionId = sessionStorage.getItem('guiders_session_id');
    if (!sessionId) {
      sessionId = this.generateUUID();
      sessionStorage.setItem('guiders_session_id', sessionId);
    }
    return sessionId;
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Agregar evento a la cola
  track(eventType, metadata = {}) {
    if (!this.initialized) {
      console.warn('[TrackingClient] Client not initialized yet. Event will be queued.');
    }

    const event = {
      visitorId: this.visitorId,
      sessionId: this.sessionId,
      eventType,
      metadata,
      occurredAt: new Date().toISOString()
    };

    this.eventQueue.push(event);

    // Auto-flush si alcanzamos el límite
    if (this.eventQueue.length >= this.maxBatchSize) {
      this.flush();
    }

    return event;
  }

  // Enviar eventos al servidor
  async flush() {
    if (this.eventQueue.length === 0) return;

    // Esperar a que se inicialice si aún no lo ha hecho
    if (!this.initialized) {
      console.warn('[TrackingClient] Waiting for initialization...');
      await this.waitForInitialization();
    }

    const eventsToSend = this.eventQueue.splice(0, this.maxBatchSize);

    try {
      const response = await fetch(`${this.apiUrl}/tracking-v2/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: this.tenantId,
          siteId: this.siteId,
          events: eventsToSend
        })
      });

      const result = await response.json();

      if (!result.success) {
        console.error('Tracking error:', result.message);
        // Re-agregar eventos a la cola si falló
        this.eventQueue.unshift(...eventsToSend);
      } else {
        console.log(`Tracked ${result.processed} events (${result.discarded} discarded)`);
      }

      return result;
    } catch (error) {
      console.error('Network error sending tracking events:', error);
      // Re-agregar eventos a la cola
      this.eventQueue.unshift(...eventsToSend);
      throw error;
    }
  }

  // Iniciar flush automático
  startAutoFlush() {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);

    // Flush al cerrar/salir de la página
    window.addEventListener('beforeunload', () => {
      if (this.eventQueue.length > 0) {
        // Usar sendBeacon para envío garantizado al salir
        const payload = JSON.stringify({
          tenantId: this.tenantId,
          siteId: this.siteId,
          events: this.eventQueue
        });
        navigator.sendBeacon(`${this.apiUrl}/tracking-v2/events`, payload);
      }
    });
  }
}

// Inicializar (obtiene automáticamente tenantId y siteId)
const tracker = new TrackingClient({
  apiUrl: 'https://api.tudominio.com',
  apiKey: '12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0'
});

// Esperar a que se inicialice (opcional)
await tracker.waitForInitialization();

// Usar (los eventos se encolarán automáticamente aunque no esté inicializado)
tracker.track('PAGE_VIEW', {
  url: window.location.href,
  title: document.title,
  referrer: document.referrer
});

tracker.track('BUTTON_CLICK', {
  buttonId: 'cta-hero',
  buttonText: 'Empezar Gratis',
  section: 'hero'
});
```

### Opción 2: React Hook

```typescript
// hooks/useTracking.ts
import { useEffect, useRef, useState } from 'react';

interface TrackingConfig {
  apiUrl: string;
  tenantId: string;
  siteId: string;
}

interface TrackEvent {
  (eventType: string, metadata?: Record<string, any>): void;
}

export function useTracking(config: TrackingConfig): TrackEvent {
  const [visitorId] = useState(() => {
    let id = localStorage.getItem('guiders_visitor_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('guiders_visitor_id', id);
    }
    return id;
  });

  const [sessionId] = useState(() => {
    let id = sessionStorage.getItem('guiders_session_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('guiders_session_id', id);
    }
    return id;
  });

  const queueRef = useRef<any[]>([]);
  const flushTimeoutRef = useRef<NodeJS.Timeout>();

  const flush = async () => {
    if (queueRef.current.length === 0) return;

    const eventsToSend = queueRef.current.splice(0, 500);

    try {
      const response = await fetch(`${config.apiUrl}/tracking-v2/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: config.tenantId,
          siteId: config.siteId,
          events: eventsToSend
        })
      });

      const result = await response.json();

      if (!result.success) {
        console.error('Tracking failed:', result.message);
        queueRef.current.unshift(...eventsToSend);
      }
    } catch (error) {
      console.error('Tracking error:', error);
      queueRef.current.unshift(...eventsToSend);
    }
  };

  const track: TrackEvent = (eventType, metadata = {}) => {
    queueRef.current.push({
      visitorId,
      sessionId,
      eventType,
      metadata,
      occurredAt: new Date().toISOString()
    });

    // Auto-flush cada 5 segundos
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = setTimeout(flush, 5000);

    // Flush inmediato si hay muchos eventos
    if (queueRef.current.length >= 100) {
      flush();
    }
  };

  // Flush al desmontar
  useEffect(() => {
    return () => {
      flush();
    };
  }, []);

  // Flush antes de salir
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (queueRef.current.length > 0) {
        const payload = JSON.stringify({
          tenantId: config.tenantId,
          siteId: config.siteId,
          events: queueRef.current
        });
        navigator.sendBeacon(`${config.apiUrl}/tracking-v2/events`, payload);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [config]);

  return track;
}

// Uso en componente
function ProductPage() {
  const track = useTracking({
    apiUrl: 'https://api.tudominio.com',
    tenantId: 'a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d',
    siteId: 'b2c3d4e5-f6a7-4b2c-9d0e-1f2a3b4c5d6e'
  });

  useEffect(() => {
    track('PAGE_VIEW', {
      url: window.location.href,
      title: document.title
    });
  }, []);

  const handleAddToCart = (product) => {
    track('ADD_TO_CART', {
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity: 1
    });
  };

  return (
    <div>
      <button onClick={() => handleAddToCart(product)}>
        Añadir al Carrito
      </button>
    </div>
  );
}
```

### Opción 3: Vue 3 Composable

```typescript
// composables/useTracking.ts
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface TrackingConfig {
  apiUrl: string;
  tenantId: string;
  siteId: string;
}

export function useTracking(config: TrackingConfig) {
  const visitorId = ref(getOrCreateVisitorId());
  const sessionId = ref(getOrCreateSessionId());
  const eventQueue = ref<any[]>([]);

  function getOrCreateVisitorId() {
    let id = localStorage.getItem('guiders_visitor_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('guiders_visitor_id', id);
    }
    return id;
  }

  function getOrCreateSessionId() {
    let id = sessionStorage.getItem('guiders_session_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('guiders_session_id', id);
    }
    return id;
  }

  async function flush() {
    if (eventQueue.value.length === 0) return;

    const eventsToSend = eventQueue.value.splice(0, 500);

    try {
      const response = await fetch(`${config.apiUrl}/tracking-v2/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: config.tenantId,
          siteId: config.siteId,
          events: eventsToSend
        })
      });

      const result = await response.json();
      if (!result.success) {
        eventQueue.value.unshift(...eventsToSend);
      }
    } catch (error) {
      console.error('Tracking error:', error);
      eventQueue.value.unshift(...eventsToSend);
    }
  }

  function track(eventType: string, metadata: Record<string, any> = {}) {
    eventQueue.value.push({
      visitorId: visitorId.value,
      sessionId: sessionId.value,
      eventType,
      metadata,
      occurredAt: new Date().toISOString()
    });

    if (eventQueue.value.length >= 100) {
      flush();
    }
  }

  let flushInterval: NodeJS.Timeout;

  onMounted(() => {
    flushInterval = setInterval(flush, 5000);

    window.addEventListener('beforeunload', () => {
      if (eventQueue.value.length > 0) {
        navigator.sendBeacon(
          `${config.apiUrl}/tracking-v2/events`,
          JSON.stringify({
            tenantId: config.tenantId,
            siteId: config.siteId,
            events: eventQueue.value
          })
        );
      }
    });
  });

  onBeforeUnmount(() => {
    clearInterval(flushInterval);
    flush();
  });

  return {
    track,
    flush,
    visitorId,
    sessionId
  };
}
```

---

## Ejemplos de Uso

### 1. Tracking de Navegación

```javascript
// Page View
tracker.track('PAGE_VIEW', {
  url: window.location.href,
  title: document.title,
  referrer: document.referrer,
  userAgent: navigator.userAgent,
  screenResolution: `${window.screen.width}x${window.screen.height}`,
  viewportSize: `${window.innerWidth}x${window.innerHeight}`
});
```

### 2. Tracking de Interacciones

```javascript
// Clic en botón
document.querySelectorAll('[data-track]').forEach(button => {
  button.addEventListener('click', (e) => {
    tracker.track('BUTTON_CLICK', {
      buttonId: e.target.id,
      buttonText: e.target.textContent,
      buttonClass: e.target.className,
      section: e.target.dataset.section
    });
  });
});

// Scroll
let lastScrollDepth = 0;
window.addEventListener('scroll', () => {
  const scrollDepth = Math.round(
    (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
  );

  // Enviar cada 25%
  if (scrollDepth >= lastScrollDepth + 25) {
    lastScrollDepth = scrollDepth;
    tracker.track('SCROLL', {
      depth: scrollDepth,
      url: window.location.href
    });
  }
});
```

### 3. Tracking de Formularios

```javascript
// Focus en campo de formulario
document.querySelectorAll('input, textarea, select').forEach(field => {
  field.addEventListener('focus', (e) => {
    tracker.track('FORM_FIELD_FOCUS', {
      formId: e.target.form?.id,
      fieldName: e.target.name,
      fieldType: e.target.type
    });
  });
});

// Envío de formulario
document.querySelectorAll('form').forEach(form => {
  form.addEventListener('submit', (e) => {
    tracker.track('FORM_SUBMIT', {
      formId: form.id,
      formAction: form.action,
      formMethod: form.method,
      fieldCount: form.elements.length
    });
  });
});
```

### 4. Tracking de E-commerce

```javascript
// Vista de producto
tracker.track('PRODUCT_VIEW', {
  productId: 'prod-123',
  productName: 'Laptop Pro 2024',
  productCategory: 'Electronics > Computers',
  price: 999.99,
  currency: 'USD',
  inStock: true
});

// Añadir al carrito
tracker.track('ADD_TO_CART', {
  productId: 'prod-123',
  productName: 'Laptop Pro 2024',
  quantity: 1,
  price: 999.99,
  cartTotal: 999.99
});

// Búsqueda
tracker.track('SEARCH', {
  query: 'laptop gaming',
  resultsCount: 42,
  filters: {
    category: 'Electronics',
    priceRange: '500-1500'
  }
});
```

### 5. Tracking de Videos

```javascript
const video = document.querySelector('video');

video.addEventListener('play', () => {
  tracker.track('VIDEO_PLAY', {
    videoId: video.dataset.videoId,
    videoTitle: video.dataset.title,
    duration: video.duration,
    currentTime: video.currentTime
  });
});

video.addEventListener('pause', () => {
  tracker.track('VIDEO_PAUSE', {
    videoId: video.dataset.videoId,
    currentTime: video.currentTime,
    percentWatched: (video.currentTime / video.duration) * 100
  });
});

video.addEventListener('ended', () => {
  tracker.track('VIDEO_COMPLETE', {
    videoId: video.dataset.videoId,
    duration: video.duration
  });
});
```

---

## Mejores Prácticas

### 1. Gestión de IDs

```javascript
// ✅ CORRECTO: Usar UUIDs v4
const visitorId = crypto.randomUUID(); // Genera UUID v4 válido

// ❌ INCORRECTO: IDs secuenciales o predecibles
const visitorId = Date.now().toString(); // NO USAR
```

### 2. Metadata Estructurada

```javascript
// ✅ CORRECTO: Metadata bien estructurada
tracker.track('PRODUCT_VIEW', {
  product: {
    id: 'prod-123',
    name: 'Laptop Pro',
    price: 999.99
  },
  context: {
    page: 'product-detail',
    source: 'search-results'
  }
});

// ❌ INCORRECTO: Datos sensibles o PII
tracker.track('FORM_SUBMIT', {
  email: 'user@example.com',  // NO incluir emails
  password: '****',            // NUNCA incluir passwords
  creditCard: '****'           // NUNCA incluir datos de pago
});
```

### 3. Batching Eficiente

```javascript
// ✅ CORRECTO: Acumular y enviar en batch
const events = [];
for (let i = 0; i < items.length; i++) {
  events.push({
    visitorId,
    sessionId,
    eventType: 'ITEM_VIEWED',
    metadata: { itemId: items[i].id }
  });
}
// Enviar todos juntos
await sendBatch(events);

// ❌ INCORRECTO: Enviar uno por uno
for (let i = 0; i < items.length; i++) {
  await sendEvent('ITEM_VIEWED', { itemId: items[i].id }); // Muchas peticiones HTTP
}
```

### 4. Manejo de Errores

```javascript
// ✅ CORRECTO: Reintentar con backoff exponencial
async function sendEventsWithRetry(events, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await sendEvents(events);
      if (result.success) return result;

      // Esperar antes de reintentar
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
    }
  }
}
```

### 5. Privacy y GDPR

```javascript
// Verificar consentimiento antes de trackear
function track(eventType, metadata) {
  const hasConsent = getCookieConsent(); // Tu función de consentimiento

  if (!hasConsent) {
    console.log('Tracking disabled: No user consent');
    return;
  }

  // Proceder con tracking
  tracker.track(eventType, metadata);
}

// Opción para deshabilitar tracking
tracker.setEnabled(false); // Detener todo tracking
```

---

## Límites y Cuotas

| Concepto | Límite | Notas |
|----------|--------|-------|
| Eventos por batch | 500 | Máximo recomendado |
| Tamaño de metadata | ~10 KB | Por evento |
| Rate limit | 100 requests/min | Por tenant |
| Retention | 12 meses | Configurable |

---

## Troubleshooting

### Error: "Invalid Uuid format"

**Causa**: Los IDs (tenantId, siteId, visitorId, sessionId) no tienen formato UUID válido.

**Solución**:
```javascript
// Usar crypto.randomUUID() o una biblioteca UUID
const visitorId = crypto.randomUUID(); // Browser moderno
// O
import { v4 as uuidv4 } from 'uuid';
const visitorId = uuidv4(); // Con biblioteca
```

### Error: "Batch size exceeds maximum"

**Causa**: Intentaste enviar más de 500 eventos en un batch.

**Solución**:
```javascript
// Dividir en chunks de 500
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

const chunks = chunkArray(events, 500);
for (const chunk of chunks) {
  await sendBatch(chunk);
}
```

### Los eventos no aparecen en estadísticas

**Posibles causas**:
1. **Throttling**: Eventos de alta frecuencia (SCROLL, MOUSE_MOVE) se descartan automáticamente (~90%)
2. **Agregación**: Eventos duplicados se consolidan con un contador
3. **Delay**: Puede haber un delay de hasta 10 segundos antes del flush del buffer

**Solución**:
- Verifica que `response.processed > 0` en la respuesta
- Eventos críticos (FORM_SUBMIT, ADD_TO_CART) siempre se conservan al 100%

---

## Soporte

Para preguntas o problemas:
- 📧 Email: soporte@tudominio.com
- 📚 Documentación API: https://api.tudominio.com/docs
- 💬 Slack: #tracking-support

---

## Changelog

### v2.0.0 (2025-01-15)
- ✨ Sistema de tracking V2 inicial
- 🚀 Batching automático con buffer
- 🎯 Throttling por tipo de evento
- 📊 Agregación de eventos duplicados
- 📅 Particionamiento mensual automático
