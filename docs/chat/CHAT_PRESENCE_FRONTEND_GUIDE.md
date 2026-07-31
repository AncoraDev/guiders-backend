# Guía de Presencia en Chat - Frontend

Esta guía explica cómo implementar el sistema de presencia **optimizado** en tiempo real para chats entre visitantes y comerciales.

> **🆕 Actualizado:** Incluye el nuevo sistema de **eventos filtrados por chats activos** y **auto-join automático** a salas personales.

## 📋 Tabla de Contenidos

- [Introducción](#introducción)
- [Novedades 2025](#novedades-2025)
- [Configuración Inicial](#configuración-inicial)
- [Guía para Comerciales](#guía-para-comerciales)
- [Guía para Visitantes](#guía-para-visitantes)
- [API REST de Presencia](#api-rest-de-presencia)
- [Eventos WebSocket](#eventos-websocket)
- [Ejemplos Completos](#ejemplos-completos)
- [Mejores Prácticas](#mejores-prácticas)
- [Troubleshooting](#troubleshooting)

---

## Introducción

El sistema de presencia permite:
- ✅ Ver el estado de conexión del otro participante (online, offline, away, busy)
- ✅ Mostrar indicadores de "está escribiendo..."
- ✅ Recibir notificaciones en tiempo real cuando cambia el estado
- ✅ Ver la última actividad del usuario
- ✅ **NUEVO:** Eventos filtrados solo para usuarios con chats activos (reducción del 99%+ en eventos)

---

## 🆕 Novedades 2025

### Sistema Optimizado de Eventos de Presencia

#### ✅ Cambios Implementados

1. **Eventos Filtrados por Chats Activos + Emisión Dual Granular**
   - Los eventos `presence:changed` ahora **SOLO** se envían a usuarios con chats activos
   - **Antes**: 1000 visitantes → 10,000 eventos broadcast 😱
   - **Ahora**: 1000 visitantes → ~10-30 eventos dirigidos ✅
   - **Reducción**: 99.7% menos tráfico WebSocket
   - **🆕 Emisión Dual**: Eventos granulares (`chatId`) + globales (`affectedChatIds[]`)

2. **Auto-Join Automático a Salas Personales**
   - Al autenticarte, el backend **automáticamente** te une a tu sala personal
   - Comerciales → `commercial:${userId}`
   - Visitantes → `visitor:${userId}`
   - **No requiere configuración adicional** ✅

3. **Nuevo Handler `presence:join` Unificado**
   - API moderna y consistente para unirse manualmente
   - Funciona para comerciales Y visitantes
   - Compatibilidad con handlers legacy (`visitor:join`)

#### ⚠️ Cambios que Requieren Actualización en Frontend

**ELIMINAR:**
```javascript
// ❌ YA NO FUNCIONA - Eliminar este código
socket.join(`tenant:${tenantId}`);
socket.on('presence:changed', ...); // Recibía TODOS los eventos
```

**NUEVO:**
```javascript
// ✅ Auto-join automático (no requiere código)
// Al autenticar, ya estás en tu sala personal

// ✅ O usa el nuevo handler unificado (opcional)
socket.emit('presence:join', {
  userId: commercialId,
  userType: 'commercial'
});

// ✅ Recibe eventos granulares y globales con contexto de chat
socket.on('presence:changed', (data) => {
  if (data.userType === 'visitor') {
    if (data.chatId) {
      // Evento GRANULAR - saber exactamente qué chat actualizar
      updateChatPresence(data.chatId, data.status);
    } else if (data.affectedChatIds) {
      // Evento GLOBAL - múltiples chats del mismo visitante
      data.affectedChatIds.forEach(chatId => {
        updateChatPresence(chatId, data.status);
      });
    }
  }
});
```

### 🎯 Gestión Automática de Presencia

El sistema detecta automáticamente la presencia y el estado de usuarios mediante:
1. **Conexión inicial** - Se marca como `online`
2. **Heartbeat** - Mantiene la conexión activa
3. **Scheduler de Inactividad** - Detecta automáticamente away/offline

#### **Visitantes:**

**Conexión Automática:**
- Al identificarse (`POST /visitors/identify`) → Automáticamente `online`
- Emite evento `presence:changed` vía WebSocket
- Aparece en la lista de visitantes online

**Detección Automática de Inactividad:**
- **0-5 minutos** sin actividad → `online` (activo)
- **5-15 minutos** sin actividad → `away` (inactivo pero conectado)
- **>15 minutos** sin actividad → `offline` (desconectado)

Scheduler ejecuta cada **2 minutos** verificando lastActivity.

#### **Comerciales:**

**Conexión Manual:**
- Debe ejecutar `POST /v2/commercials/connect` al iniciar sesión

**Detección Automática de Inactividad:**
- **0-5 minutos** sin actividad → `online` (activo)
- **5-10 minutos** sin actividad → `away` (inactivo pero conectado)
- **>10 minutos** sin actividad → `offline` (desconectado)

Scheduler ejecuta cada **2 minutos** verificando lastActivity.

**⚙️ Configuración:**
Los schedulers pueden deshabilitarse con la variable de entorno:
```bash
PRESENCE_INACTIVITY_ENABLED=false
```

### Estados de presencia disponibles

| Estado | Descripción | Disponible para chat |
|--------|-------------|---------------------|
| `online` | Conectado y activo | ✅ Sí |
| `away` | Conectado pero inactivo > 5 min | ⚠️ Puede responder tarde |
| `busy` | Conectado pero ocupado | ⚠️ Puede responder tarde |
| `chatting` | En otro chat (solo visitantes) | ⚠️ Puede responder tarde |
| `offline` | Desconectado | ❌ No |

---

## Configuración Inicial

### 1. Instalar Socket.IO Client

```bash
npm install socket.io-client
# o
yarn add socket.io-client
```

### 2. Configurar la conexión WebSocket

```javascript
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3000'; // Cambiar según ambiente

// Opción 1: Con JWT Token (para comerciales)
const socket = io(BACKEND_URL, {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  auth: {
    token: 'Bearer YOUR_JWT_TOKEN' // Token del comercial
  }
});

// Opción 2: Con cookies de sesión (para visitantes)
const socket = io(BACKEND_URL, {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  withCredentials: true // Importante para enviar cookies
});
```

### 3. Verificar conexión

```javascript
socket.on('connect', () => {
  console.log('✅ Conectado al servidor WebSocket');
  console.log('Client ID:', socket.id);
});

socket.on('disconnect', () => {
  console.log('❌ Desconectado del servidor WebSocket');
});

socket.on('connect_error', (error) => {
  console.error('Error de conexión:', error.message);
});
```

---

## Guía para Comerciales

### Flujo de Trabajo del Comercial

```
1. Login → Obtener JWT token
2. Conectar a WebSocket con token
   ✅ NUEVO: Auto-join automático a sala personal commercial:{id}
3. Ejecutar POST /v2/commercials/connect
4. Unirse a la sala del chat (chat:join)
5. Enviar heartbeats cada 60s
6. Recibir presencia SOLO de visitantes con chats activos (optimizado)
7. Mostrar presencia del visitante
8. Indicar cuando está escribiendo
```

### 🆕 Auto-Join Automático

Al conectarte al WebSocket con tu token JWT, el sistema **automáticamente**:
- ✅ Te une a tu sala personal `commercial:{commercialId}`
- ✅ Emite evento `presence:joined` con `automatic: true`
- ✅ Configura la recepción de eventos filtrados

**NO necesitas código adicional** para unirte a tu sala personal. El backend lo hace automáticamente durante la autenticación.

### 🎯 Eventos Filtrados

**IMPORTANTE**: Solo recibirás eventos `presence:changed` de visitantes con los que **tienes chats activos** (PENDING, ASSIGNED, ACTIVE, TRANSFERRED).

- **Antes**: 1000 visitantes online → 1000 eventos
- **Ahora**: 1000 visitantes online, 5 chats activos → 5 eventos ✅

### 1. Conectarse al sistema

```javascript
class CommercialPresenceManager {
  constructor(commercialId, jwtToken) {
    this.commercialId = commercialId;
    this.jwtToken = jwtToken;
    this.socket = null;
    this.heartbeatInterval = null;
    this.currentChatId = null;
  }

  // Paso 1: Conectar al sistema de comerciales
  async connect() {
    try {
      // 1.1 Conectar como comercial disponible
      const response = await fetch('http://localhost:3000/api/v2/commercials/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({
          id: this.commercialId,
          name: 'Juan Pérez',
          metadata: { department: 'ventas' }
        })
      });

      const data = await response.json();
      console.log('✅ Comercial conectado:', data);

      // 1.2 Conectar al WebSocket
      this.socket = io('http://localhost:3000', {
        path: '/socket.io/',
        auth: { token: `Bearer ${this.jwtToken}` }
      });

      this.setupSocketListeners();

      // 1.3 Iniciar heartbeats cada 60 segundos
      this.startHeartbeat();

    } catch (error) {
      console.error('❌ Error al conectar:', error);
    }
  }

  // Paso 2: Enviar heartbeats periódicos
  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await fetch('http://localhost:3000/api/v2/commercials/heartbeat', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.jwtToken}`
          },
          body: JSON.stringify({ id: this.commercialId })
        });
        console.log('💓 Heartbeat enviado');
      } catch (error) {
        console.error('❌ Error en heartbeat:', error);
      }
    }, 60000); // Cada 60 segundos
  }

  // Paso 3: Unirse a la sala del chat
  joinChat(chatId) {
    this.currentChatId = chatId;
    this.socket.emit('chat:join', { chatId });
    console.log(`🔗 Unido a sala: chat:${chatId}`);
  }

  // Paso 4: Configurar listeners de presencia
  setupSocketListeners() {
    // 🆕 Confirmación de auto-join a sala personal
    this.socket.on('presence:joined', (data) => {
      console.log('✅ Auto-join completado:', data);
      // data.automatic === true indica que fue automático
      // data.roomName === 'commercial:{commercialId}'
    });

    // Escuchar cuando el visitante está escribiendo
    this.socket.on('typing:start', (data) => {
      if (data.userType === 'visitor') {
        this.onVisitorTyping(data);
      }
    });

    this.socket.on('typing:stop', (data) => {
      if (data.userType === 'visitor') {
        this.onVisitorStoppedTyping(data);
      }
    });

    // 🆕 Eventos filtrados: solo visitantes con chats activos
    this.socket.on('presence:changed', (data) => {
      if (data.userType === 'visitor') {
        // Solo recibirás eventos de visitantes con chats activos contigo
        this.onVisitorPresenceChanged(data);
      }
    });
  }

  // Paso 5: Indicar que estoy escribiendo
  async startTyping() {
    if (!this.currentChatId) return;

    try {
      await fetch(`http://localhost:3000/api/presence/chat/${this.currentChatId}/typing/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.jwtToken}` }
      });
    } catch (error) {
      console.error('Error al enviar typing:start', error);
    }
  }

  async stopTyping() {
    if (!this.currentChatId) return;

    try {
      await fetch(`http://localhost:3000/api/presence/chat/${this.currentChatId}/typing/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.jwtToken}` }
      });
    } catch (error) {
      console.error('Error al enviar typing:stop', error);
    }
  }

  // Paso 6: Obtener presencia actual del chat
  async getChatPresence() {
    if (!this.currentChatId) return null;

    try {
      const response = await fetch(
        `http://localhost:3000/api/presence/chat/${this.currentChatId}`,
        {
          headers: { 'Authorization': `Bearer ${this.jwtToken}` }
        }
      );
      return await response.json();
    } catch (error) {
      console.error('Error al obtener presencia:', error);
      return null;
    }
  }

  // Callbacks para UI (implementar según tu framework)
  onVisitorTyping(data) {
    console.log('👤 Visitante está escribiendo...', data);
    // Mostrar indicador: "El visitante está escribiendo..."
  }

  onVisitorStoppedTyping(data) {
    console.log('👤 Visitante dejó de escribir', data);
    // Ocultar indicador de escritura
  }

  onVisitorPresenceChanged(data) {
    console.log('👤 Cambio de presencia del visitante:', data);
    // Actualizar badge de estado: online, away, offline
  }

  // Cleanup
  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Uso:
const manager = new CommercialPresenceManager(
  'd9b32cfd-f838-4764-b03f-465ed59ce245',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
);

await manager.connect();
manager.joinChat('chat-123');

// En el input de mensajes:
inputField.addEventListener('input', () => {
  manager.startTyping();

  // Auto-stop después de 2 segundos
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => manager.stopTyping(), 2000);
});

// Al salir del chat:
// manager.disconnect();
```

### 2. Ejemplo con React Hooks

```jsx
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

function useCommercialPresence(commercialId, jwtToken, chatId) {
  const [visitorStatus, setVisitorStatus] = useState('offline');
  const [visitorTyping, setVisitorTyping] = useState(false);
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    // Conectar al sistema
    const connectCommercial = async () => {
      // 1. Conectar como comercial
      await fetch('http://localhost:3000/api/v2/commercials/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ id: commercialId, name: 'Comercial' })
      });

      // 2. Conectar WebSocket
      socketRef.current = io('http://localhost:3000', {
        path: '/socket.io/',
        auth: { token: `Bearer ${jwtToken}` }
      });

      // 3. Unirse al chat
      socketRef.current.emit('chat:join', { chatId });

      // 4. Escuchar eventos
      socketRef.current.on('typing:start', (data) => {
        if (data.userType === 'visitor') {
          setVisitorTyping(true);
        }
      });

      socketRef.current.on('typing:stop', (data) => {
        if (data.userType === 'visitor') {
          setVisitorTyping(false);
        }
      });

      socketRef.current.on('presence:changed', (data) => {
        if (data.userType === 'visitor') {
          setVisitorStatus(data.status);
        }
      });

      // 5. Heartbeat cada 60s
      heartbeatRef.current = setInterval(async () => {
        await fetch('http://localhost:3000/api/v2/commercials/heartbeat', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`
          },
          body: JSON.stringify({ id: commercialId })
        });
      }, 60000);
    };

    connectCommercial();

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [commercialId, jwtToken, chatId]);

  const startTyping = async () => {
    await fetch(`http://localhost:3000/api/presence/chat/${chatId}/typing/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jwtToken}` }
    });
  };

  const stopTyping = async () => {
    await fetch(`http://localhost:3000/api/presence/chat/${chatId}/typing/stop`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jwtToken}` }
    });
  };

  return {
    visitorStatus,
    visitorTyping,
    startTyping,
    stopTyping
  };
}

// Componente de chat
function ChatCommercial({ commercialId, jwtToken, chatId }) {
  const { visitorStatus, visitorTyping, startTyping, stopTyping } =
    useCommercialPresence(commercialId, jwtToken, chatId);

  const [message, setMessage] = useState('');
  const typingTimeoutRef = useRef(null);

  const handleInputChange = (e) => {
    setMessage(e.target.value);

    // Notificar que estoy escribiendo
    startTyping();

    // Auto-stop después de 2 segundos
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <span className={`status-badge ${visitorStatus}`}>
          {visitorStatus === 'online' && '🟢 Online'}
          {visitorStatus === 'away' && '🟡 Ausente'}
          {visitorStatus === 'offline' && '⚫ Offline'}
        </span>
      </div>

      <div className="chat-messages">
        {/* Mensajes */}
        {visitorTyping && (
          <div className="typing-indicator">
            El visitante está escribiendo...
          </div>
        )}
      </div>

      <input
        type="text"
        value={message}
        onChange={handleInputChange}
        placeholder="Escribe un mensaje..."
      />
    </div>
  );
}
```

---

## Guía para Visitantes

### Flujo de Trabajo del Visitante

```
1. Cargar widget en sitio web
2. Identificar visitante (POST /visitors/identify)
   → Automáticamente marca como "online" ✅
   → Notifica SOLO a comerciales con chats activos 🔔 (optimizado)
3. Conectar a WebSocket con cookies de sesión
   ✅ NUEVO: Auto-join automático a sala personal visitor:{id}
4. Crear chat (POST /v2/chats/with-message)
5. Unirse a la sala del chat (chat:join)
6. Recibir presencia SOLO del comercial asignado (optimizado)
7. Mostrar presencia del comercial
8. Indicar cuando está escribiendo
```

### 🆕 Auto-Join Automático

Al conectarte al WebSocket con tu sesión, el sistema **automáticamente**:
- ✅ Te une a tu sala personal `visitor:{visitorId}`
- ✅ Emite evento `presence:joined` con `automatic: true`
- ✅ Configura la recepción de eventos filtrados

**NO necesitas código adicional** para unirte a tu sala personal.

### 🎯 Eventos Filtrados

**IMPORTANTE**: Solo recibirás eventos `presence:changed` del comercial asignado a tu chat activo.

- **Antes**: 100 comerciales online → 100 eventos
- **Ahora**: 100 comerciales online, 1 asignado → 1 evento ✅

**🎯 Notificación Automática:**
Cuando un visitante se identifica exitosamente (paso 2), el sistema **automáticamente**:
- ✅ Marca al visitante como `online` en Redis
- ✅ Emite evento `presence:changed` vía WebSocket
- ✅ Los comerciales reciben notificación en tiempo real de que hay un nuevo visitante conectado
- ✅ El visitante aparece en la lista de visitantes online del dashboard

**No necesitas hacer nada adicional** - la presencia se gestiona automáticamente. Opcionalmente puedes cambiar el estado manualmente con `PUT /visitors/status`.

### 1. Inicialización del Widget

```javascript
class VisitorPresenceManager {
  constructor(domain, apiKey) {
    this.domain = domain;
    this.apiKey = apiKey;
    this.socket = null;
    this.currentChatId = null;
    this.sessionId = null;
    this.visitorId = null;
  }

  // Paso 1: Identificar visitante (automáticamente marca como online)
  async identifyVisitor(fingerprint) {
    try {
      const response = await fetch('http://localhost:3000/visitors/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Importante para recibir cookie de sesión
        body: JSON.stringify({
          fingerprint, // Identificador único del navegador
          domain: this.domain,
          apiKey: this.apiKey,
          hasAcceptedPrivacyPolicy: true,
          currentUrl: window.location.href
        })
      });

      const data = await response.json();
      this.visitorId = data.visitorId;
      this.sessionId = data.sessionId;

      console.log('✅ Visitante identificado:', data);
      console.log('🟢 Visitante automáticamente marcado como ONLINE');
      console.log('🔔 Comerciales notificados vía WebSocket');

      return data;
    } catch (error) {
      console.error('❌ Error al identificar visitante:', error);
      throw error;
    }
  }

  // Paso 2: Inicializar WebSocket
  async initialize() {
    try {
      // 2.1 Conectar al WebSocket (usando cookies de sesión)
      this.socket = io('http://localhost:3000', {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        withCredentials: true // Importante para cookies
      });

      this.setupSocketListeners();

      console.log('✅ WebSocket conectado');
    } catch (error) {
      console.error('❌ Error al inicializar WebSocket:', error);
    }
  }

  // Paso 2: Crear chat con primer mensaje
  async createChat(message) {
    try {
      const response = await fetch('http://localhost:3000/api/v2/chats/with-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Incluir cookies
        body: JSON.stringify({
          siteId: this.siteId,
          message: {
            content: message,
            type: 'text'
          },
          visitorInfo: {
            // Se puede incluir info adicional si ya está identificado
          }
        })
      });

      const data = await response.json();
      this.currentChatId = data.chat.id;

      // Unirse a la sala del chat
      this.joinChat(this.currentChatId);

      return data;
    } catch (error) {
      console.error('❌ Error al crear chat:', error);
      throw error;
    }
  }

  // Paso 3: Unirse a la sala del chat
  joinChat(chatId) {
    this.currentChatId = chatId;
    this.socket.emit('chat:join', { chatId });
    console.log(`🔗 Visitante unido a sala: chat:${chatId}`);
  }

  // Paso 4: Configurar listeners de presencia
  setupSocketListeners() {
    // 🆕 Confirmación de auto-join a sala personal
    this.socket.on('presence:joined', (data) => {
      console.log('✅ Auto-join completado:', data);
      // data.automatic === true indica que fue automático
      // data.roomName === 'visitor:{visitorId}'
    });

    // Escuchar cuando el comercial está escribiendo
    this.socket.on('typing:start', (data) => {
      if (data.userType === 'commercial') {
        this.onCommercialTyping(data);
      }
    });

    this.socket.on('typing:stop', (data) => {
      if (data.userType === 'commercial') {
        this.onCommercialStoppedTyping(data);
      }
    });

    // 🆕 Eventos filtrados: solo del comercial asignado a tu chat
    this.socket.on('presence:changed', (data) => {
      if (data.userType === 'commercial') {
        // Solo recibirás eventos del comercial asignado a tu chat activo
        this.onCommercialPresenceChanged(data);
      }
    });
  }

  // Paso 5: Indicar que estoy escribiendo
  async startTyping() {
    if (!this.currentChatId) return;

    try {
      await fetch(`http://localhost:3000/api/presence/chat/${this.currentChatId}/typing/start`, {
        method: 'POST',
        credentials: 'include' // Usar cookies de sesión
      });
    } catch (error) {
      console.error('Error al enviar typing:start', error);
    }
  }

  async stopTyping() {
    if (!this.currentChatId) return;

    try {
      await fetch(`http://localhost:3000/api/presence/chat/${this.currentChatId}/typing/stop`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Error al enviar typing:stop', error);
    }
  }

  // Paso 6: Obtener presencia actual del chat
  async getChatPresence() {
    if (!this.currentChatId) return null;

    try {
      const response = await fetch(
        `http://localhost:3000/api/presence/chat/${this.currentChatId}`,
        { credentials: 'include' }
      );
      return await response.json();
    } catch (error) {
      console.error('Error al obtener presencia:', error);
      return null;
    }
  }

  // Callbacks para UI
  onCommercialTyping(data) {
    console.log('💼 Comercial está escribiendo...', data);
    // Mostrar indicador: "Un agente está escribiendo..."
  }

  onCommercialStoppedTyping(data) {
    console.log('💼 Comercial dejó de escribir', data);
    // Ocultar indicador de escritura
  }

  onCommercialPresenceChanged(data) {
    console.log('💼 Cambio de presencia del comercial:', data);
    // Actualizar badge: "Agente conectado" / "Agente ausente"
  }

  // Cleanup
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Uso en widget:
const visitorManager = new VisitorPresenceManager(
  'landing.mytech.com', // domain
  'ak_live_1234567890'  // apiKey
);

// Paso 1: Identificar visitante (automáticamente marca como online)
const fingerprint = generateFingerprint(); // ej: usando FingerprintJS
await visitorManager.identifyVisitor(fingerprint);
// → Visitante ahora aparece como ONLINE para los comerciales ✅

// Paso 2: Conectar WebSocket
await visitorManager.initialize();

// Paso 3: Cuando el visitante envía el primer mensaje
const chat = await visitorManager.createChat('Hola, necesito ayuda');

// En el input de mensajes:
inputField.addEventListener('input', () => {
  visitorManager.startTyping();

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => visitorManager.stopTyping(), 2000);
});
```

### 2. Ejemplo con Widget Embebido

```html
<!-- Widget en el sitio del cliente -->
<script>
(function() {
  const GUIDERS_CONFIG = {
    siteId: 'c903a0af-0bcb-4da3-bf9d-3b8d3d0ccfae',
    apiKey: 'ak_live_1234567890',
    backendUrl: 'http://localhost:3000'
  };

  class GuidersWidget {
    constructor(config) {
      this.config = config;
      this.socket = null;
      this.chatId = null;
      this.isOpen = false;
    }

    init() {
      // Conectar WebSocket
      this.socket = io(this.config.backendUrl, {
        path: '/socket.io/',
        withCredentials: true
      });

      this.socket.on('connect', () => {
        console.log('✅ Widget conectado');
      });

      // Listeners de presencia
      this.socket.on('typing:start', (data) => {
        if (data.userType === 'commercial') {
          this.showTypingIndicator();
        }
      });

      this.socket.on('typing:stop', () => {
        this.hideTypingIndicator();
      });

      this.socket.on('presence:changed', (data) => {
        if (data.userType === 'commercial') {
          this.updateCommercialStatus(data.status);
        }
      });

      // Crear UI del widget
      this.createWidget();
    }

    async openChat() {
      if (this.isOpen) return;
      this.isOpen = true;

      // Consultar disponibilidad antes de abrir
      const availability = await this.checkAvailability();

      if (!availability.available) {
        this.showOfflineMessage();
        return;
      }

      this.showChatWindow();
    }

    async checkAvailability() {
      const response = await fetch(
        `${this.config.backendUrl}/api/v2/commercials/availability`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: window.location.hostname,
            apiKey: this.config.apiKey
          })
        }
      );
      return await response.json();
    }

    async sendMessage(message) {
      if (!this.chatId) {
        // Crear chat con primer mensaje
        const response = await fetch(
          `${this.config.backendUrl}/api/v2/chats/with-message`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              siteId: this.config.siteId,
              message: { content: message, type: 'text' }
            })
          }
        );

        const data = await response.json();
        this.chatId = data.chat.id;

        // Unirse a la sala
        this.socket.emit('chat:join', { chatId: this.chatId });
      } else {
        // Enviar mensaje a chat existente
        // (Implementar según tu endpoint de mensajes)
      }
    }

    showTypingIndicator() {
      const indicator = document.getElementById('guiders-typing-indicator');
      if (indicator) {
        indicator.textContent = 'Un agente está escribiendo...';
        indicator.style.display = 'block';
      }
    }

    hideTypingIndicator() {
      const indicator = document.getElementById('guiders-typing-indicator');
      if (indicator) {
        indicator.style.display = 'none';
      }
    }

    updateCommercialStatus(status) {
      const badge = document.getElementById('guiders-status-badge');
      if (badge) {
        badge.className = `status-badge ${status}`;
        badge.textContent = status === 'online' ? '🟢 Agente disponible' : '⚫ Agente ausente';
      }
    }

    createWidget() {
      // Crear HTML del widget
      const widgetHTML = `
        <div id="guiders-widget">
          <button id="guiders-toggle" onclick="guidersWidget.openChat()">
            💬 Chat
          </button>
          <div id="guiders-chat-window" style="display: none;">
            <div class="header">
              <span id="guiders-status-badge">🟢 Agente disponible</span>
            </div>
            <div class="messages"></div>
            <div id="guiders-typing-indicator" style="display: none;"></div>
            <input id="guiders-input" placeholder="Escribe un mensaje..." />
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', widgetHTML);

      // Event listener para input
      const input = document.getElementById('guiders-input');
      let typingTimeout;

      input.addEventListener('input', async () => {
        if (!this.chatId) return;

        // Notificar typing
        await fetch(
          `${this.config.backendUrl}/api/presence/chat/${this.chatId}/typing/start`,
          { method: 'POST', credentials: 'include' }
        );

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(async () => {
          await fetch(
            `${this.config.backendUrl}/api/presence/chat/${this.chatId}/typing/stop`,
            { method: 'POST', credentials: 'include' }
          );
        }, 2000);
      });
    }
  }

  // Inicializar widget
  window.guidersWidget = new GuidersWidget(GUIDERS_CONFIG);
  window.guidersWidget.init();
})();
</script>
```

---

## API REST de Presencia

### Endpoints disponibles

#### 1. **GET /presence/chat/:chatId** - Obtener presencia actual

**Headers:**
```
Authorization: Bearer {token}  # Para comerciales
Cookie: session_id={id}        # Para visitantes
```

**Response:**
```json
{
  "chatId": "123e4567-e89b-12d3-a456-426614174000",
  "participants": [
    {
      "userId": "visitor-uuid",
      "userType": "visitor",
      "connectionStatus": "online",
      "isTyping": false,
      "lastActivity": "2025-10-19T19:48:10.958Z"
    },
    {
      "userId": "commercial-uuid",
      "userType": "commercial",
      "connectionStatus": "online",
      "isTyping": true,
      "lastActivity": "2025-10-19T19:48:15.123Z"
    }
  ],
  "timestamp": "2025-10-19T19:48:20.000Z"
}
```

#### 2. **POST /presence/chat/:chatId/typing/start** - Empezar a escribir

**Response:** `204 No Content`

**Efecto:**
- Guarda en Redis con TTL de 3 segundos
- Emite evento `typing:start` via WebSocket a la sala `chat:{chatId}`
- Se auto-expira si no se renueva

#### 3. **POST /presence/chat/:chatId/typing/stop** - Dejar de escribir

**Response:** `204 No Content`

**Efecto:**
- Elimina el estado de Redis
- Emite evento `typing:stop` via WebSocket

#### 4. **PUT /v2/commercials/status** - Cambiar estado del comercial

**Descripción:** Permite a un comercial cambiar manualmente su estado de conexión.

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "e7f8a9b0-1234-5678-9abc-def012345678",
  "status": "busy"
}
```

**Estados válidos:** `online`, `offline`, `busy`, `away`

**Response:**
```json
{
  "success": true,
  "message": "Estado cambiado a busy exitosamente",
  "commercial": {
    "id": "e7f8a9b0-1234-5678-9abc-def012345678",
    "name": "Commercial",
    "connectionStatus": "BUSY",
    "lastActivity": "2025-10-19T20:15:30.000Z",
    "isActive": false
  }
}
```

**Efecto:**
- Actualiza estado en Redis
- Emite evento `presence:changed` via WebSocket a todas las salas relevantes
- Los visitantes ven el cambio de estado en tiempo real

**Ejemplo de uso:**
```javascript
async function setCommercialStatus(commercialId, newStatus) {
  const response = await fetch('http://localhost:3000/v2/commercials/status', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: commercialId,
      status: newStatus // 'online', 'busy', 'away', 'offline'
    })
  });

  if (!response.ok) {
    throw new Error('Error al cambiar estado');
  }

  const result = await response.json();
  console.log(`✅ Estado cambiado a: ${result.commercial.connectionStatus}`);
  return result;
}

// Uso:
await setCommercialStatus('commercial-uuid', 'busy');
```

#### 5. **PUT /visitors/status** - Cambiar estado del visitante

**Descripción:** Permite a un visitante cambiar manualmente su estado de conexión.

**Headers:**
```
Cookie: session_id={id}  # Autenticación con cookie de sesión
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "status": "away"
}
```

**Estados válidos:** `online`, `offline`, `chatting`, `away`

**Response:**
```json
{
  "success": true,
  "message": "Estado cambiado a away exitosamente",
  "status": "away"
}
```

**Efecto:**
- Actualiza estado en Redis
- Emite evento `presence:changed` via WebSocket
- Los comerciales ven el cambio de estado en tiempo real

**Ejemplo de uso:**
```javascript
async function setVisitorStatus(visitorId, newStatus) {
  const response = await fetch('http://localhost:3000/visitors/status', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include', // Importante para enviar cookies
    body: JSON.stringify({
      id: visitorId,
      status: newStatus // 'online', 'away', 'chatting', 'offline'
    })
  });

  if (!response.ok) {
    throw new Error('Error al cambiar estado');
  }

  const result = await response.json();
  console.log(`✅ Estado cambiado a: ${result.status}`);
  return result;
}

// Uso:
await setVisitorStatus('visitor-uuid', 'away');
```

#### 6. **GET /v2/commercials/:id/status** - Consultar estado del comercial

**Response:**
```json
{
  "commercialId": "e7f8a9b0-1234-5678-9abc-def012345678",
  "connectionStatus": "online",
  "lastActivity": "2025-10-19T20:15:30.000Z",
  "isActive": true
}
```

---

## Eventos WebSocket

### Eventos que RECIBES

#### 🆕 `presence:joined` - Confirmación de unión a sala personal

**Nuevo en 2025**: Se emite automáticamente al conectarte.

```javascript
socket.on('presence:joined', (data) => {
  // data = {
  //   userId: "commercial-uuid" | "visitor-uuid",
  //   userType: "commercial" | "visitor",
  //   roomName: "commercial:uuid" | "visitor:uuid",
  //   timestamp: 1234567890,
  //   automatic: true  // 🆕 Indica que fue auto-join
  // }

  console.log(`✅ Unido a sala personal: ${data.roomName}`);
});
```

**Cuándo se emite:**
- ✅ Automáticamente al autenticarte (con `automatic: true`)
- ✅ Opcionalmente si llamas manualmente a `presence:join` (sin `automatic`)

#### `typing:start`

```javascript
socket.on('typing:start', (data) => {
  // data = {
  //   chatId: "chat-123",
  //   userId: "user-456",
  //   userType: "commercial" | "visitor",
  //   timestamp: "2025-10-19T19:48:15.123Z"
  // }
});
```

#### `typing:stop`

```javascript
socket.on('typing:stop', (data) => {
  // data = {
  //   chatId: "chat-123",
  //   userId: "user-456",
  //   userType: "commercial" | "visitor",
  //   timestamp: "2025-10-19T19:48:18.456Z"
  // }
});
```

#### 🆕 `presence:changed` - Eventos filtrados y granulares por chat

**Nuevo comportamiento en 2025**: Sistema de emisión dual con eventos granulares por chat.

##### Formato de eventos

El sistema ahora emite **dos tipos de eventos** para compatibilidad:

**1. Evento GRANULAR** (recibido en sala `chat:{chatId}`):
```javascript
socket.on('presence:changed', (data) => {
  // data = {
  //   userId: "user-456",
  //   userType: "commercial" | "visitor",
  //   status: "away",
  //   previousStatus: "online",
  //   timestamp: "2025-10-19T19:53:00.000Z",
  //   tenantId: "tenant-123",
  //   chatId: "chat-uuid-123"  // ✅ NUEVO: ID del chat específico
  // }
});
```

**2. Evento GLOBAL** (recibido en sala `visitor:{id}` o `commercial:{id}`):
```javascript
socket.on('presence:changed', (data) => {
  // data = {
  //   userId: "user-456",
  //   userType: "commercial" | "visitor",
  //   status: "away",
  //   previousStatus: "online",
  //   timestamp: "2025-10-19T19:53:00.000Z",
  //   tenantId: "tenant-123",
  //   affectedChatIds: ["chat-1", "chat-2", "chat-3"]  // ✅ NUEVO: todos los chats afectados
  // }
});
```

##### Uso recomendado

```javascript
socket.on('presence:changed', (data) => {
  if (data.chatId) {
    // Evento GRANULAR - actualizar chat específico
    updateChatPresence(data.chatId, data.status);
  } else if (data.affectedChatIds) {
    // Evento GLOBAL - actualizar múltiples chats
    data.affectedChatIds.forEach(chatId => {
      updateChatPresence(chatId, data.status);
    });
  } else {
    // Evento de auto-actualización (sin chatId ni affectedChatIds)
    // Emitido a la sala del propio usuario
    updateMyStatus(data.status);
  }
});
```

##### Ventajas del sistema dual

| Característica | Evento Granular | Evento Global |
|----------------|-----------------|---------------|
| **Sala destino** | `chat:{chatId}` | `visitor:{id}` / `commercial:{id}` |
| **Contiene chatId** | ✅ Sí (único) | ❌ No |
| **Contiene affectedChatIds** | ❌ No | ✅ Sí (array) |
| **Uso ideal** | Actualizar 1 chat | Actualizar múltiples chats a la vez |
| **Compatibilidad** | Clientes nuevos | Clientes existentes |

##### Escenario: Visitante con múltiples chats

Cuando un visitante cambia de estado y tiene 3 chats activos con 2 comerciales:

```
Emisiones:
1. visitor:${visitorId}     → evento auto-actualización
2. chat:chat-1              → chatId: "chat-1"
3. chat:chat-2              → chatId: "chat-2"
4. chat:chat-3              → chatId: "chat-3"
5. commercial:${commercial1Id} → affectedChatIds: ["chat-1", "chat-2"]
6. commercial:${commercial2Id} → affectedChatIds: ["chat-3"]
```

**Estados posibles:**
- `online` - Usuario conectado y activo
- `away` - Usuario inactivo (>5 min sin actividad)
- `busy` - Comercial ocupado (solo commercials)
- `chatting` - Visitante en otro chat (solo visitors)
- `offline` - Usuario desconectado

### Eventos que ENVÍAS

#### `chat:join` - Unirse a sala de chat

```javascript
socket.emit('chat:join', {
  chatId: 'chat-123',
  token: 'Bearer YOUR_JWT' // Opcional
});
```

#### `chat:leave` - Salir de sala de chat

```javascript
socket.emit('chat:leave', {
  chatId: 'chat-123'
});
```

#### 🆕 `presence:join` - Unirse manualmente a sala personal (opcional)

**Nuevo en 2025**: Handler unificado para unirse manualmente (generalmente no necesario por auto-join).

```javascript
socket.emit('presence:join', {
  userId: 'commercial-uuid' | 'visitor-uuid',
  userType: 'commercial' | 'visitor'
});

// Respuesta:
socket.on('presence:joined', (response) => {
  // response = {
  //   userId: "...",
  //   userType: "...",
  //   roomName: "commercial:uuid" | "visitor:uuid",
  //   timestamp: 1234567890,
  //   automatic: false  // Manual join
  // }
});
```

**Cuándo usar:**
- ⚠️ Generalmente **NO es necesario** porque el auto-join es automático
- ✅ Útil si necesitas reconectarte manualmente después de perder conexión
- ✅ Para testing o debugging

#### 🆕 `presence:leave` - Salir de sala personal (opcional)

```javascript
socket.emit('presence:leave', {
  userId: 'commercial-uuid' | 'visitor-uuid',
  userType: 'commercial' | 'visitor'
});

// Respuesta:
socket.on('presence:left', (response) => {
  // response = {
  //   userId: "...",
  //   userType: "...",
  //   roomName: "commercial:uuid" | "visitor:uuid",
  //   timestamp: 1234567890
  // }
});
```

---

## Ejemplos Completos

### Ejemplo 1: Indicador de "Escribiendo..." con debounce

```javascript
class TypingIndicator {
  constructor(chatId, authToken) {
    this.chatId = chatId;
    this.authToken = authToken;
    this.typingTimeout = null;
    this.isTyping = false;
  }

  async onInput() {
    // Si no estaba escribiendo, notificar inicio
    if (!this.isTyping) {
      this.isTyping = true;
      await this.sendTypingStart();
    }

    // Renovar timeout para auto-stop
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.typingTimeout = setTimeout(async () => {
      this.isTyping = false;
      await this.sendTypingStop();
    }, 2000); // Stop después de 2s de inactividad
  }

  async sendTypingStart() {
    await fetch(`/api/presence/chat/${this.chatId}/typing/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });
  }

  async sendTypingStop() {
    await fetch(`/api/presence/chat/${this.chatId}/typing/stop`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });
  }

  cleanup() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    if (this.isTyping) {
      this.sendTypingStop();
    }
  }
}

// Uso:
const typingIndicator = new TypingIndicator('chat-123', jwtToken);

inputElement.addEventListener('input', () => {
  typingIndicator.onInput();
});

// Al salir del chat:
window.addEventListener('beforeunload', () => {
  typingIndicator.cleanup();
});
```

### Ejemplo 2: Badge de estado con colores

```javascript
function getStatusBadge(status) {
  const badges = {
    online: {
      icon: '🟢',
      text: 'En línea',
      color: '#10B981',
      description: 'Responderá pronto'
    },
    away: {
      icon: '🟡',
      text: 'Ausente',
      color: '#F59E0B',
      description: 'Puede tardar en responder'
    },
    busy: {
      icon: '🔴',
      text: 'Ocupado',
      color: '#EF4444',
      description: 'Atendiendo otro chat'
    },
    offline: {
      icon: '⚫',
      text: 'Desconectado',
      color: '#6B7280',
      description: 'No disponible'
    }
  };

  return badges[status] || badges.offline;
}

// En tu componente:
function StatusBadge({ status }) {
  const badge = getStatusBadge(status);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 12px',
      backgroundColor: badge.color + '20',
      borderRadius: '12px'
    }}>
      <span>{badge.icon}</span>
      <div>
        <div style={{ fontWeight: 'bold', color: badge.color }}>
          {badge.text}
        </div>
        <div style={{ fontSize: '12px', color: '#6B7280' }}>
          {badge.description}
        </div>
      </div>
    </div>
  );
}
```

### Ejemplo 3: Polling de presencia como fallback

```javascript
class PresencePoller {
  constructor(chatId, authToken, interval = 30000) {
    this.chatId = chatId;
    this.authToken = authToken;
    this.interval = interval;
    this.pollInterval = null;
    this.lastPresence = null;
    this.onChangeCallback = null;
  }

  start() {
    this.poll(); // Poll inmediato
    this.pollInterval = setInterval(() => this.poll(), this.interval);
  }

  async poll() {
    try {
      const response = await fetch(
        `http://localhost:3000/api/presence/chat/${this.chatId}`,
        {
          headers: { 'Authorization': `Bearer ${this.authToken}` }
        }
      );

      const presence = await response.json();

      // Detectar cambios
      if (this.lastPresence && this.onChangeCallback) {
        this.detectChanges(this.lastPresence, presence);
      }

      this.lastPresence = presence;
    } catch (error) {
      console.error('Error en polling de presencia:', error);
    }
  }

  detectChanges(oldPresence, newPresence) {
    newPresence.participants.forEach((newParticipant, index) => {
      const oldParticipant = oldPresence.participants[index];

      if (!oldParticipant) return;

      // Detectar cambio de estado
      if (oldParticipant.connectionStatus !== newParticipant.connectionStatus) {
        this.onChangeCallback({
          type: 'status_changed',
          participant: newParticipant,
          oldStatus: oldParticipant.connectionStatus,
          newStatus: newParticipant.connectionStatus
        });
      }

      // Detectar cambio de typing
      if (oldParticipant.isTyping !== newParticipant.isTyping) {
        this.onChangeCallback({
          type: newParticipant.isTyping ? 'typing_start' : 'typing_stop',
          participant: newParticipant
        });
      }
    });
  }

  onChange(callback) {
    this.onChangeCallback = callback;
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}

// Uso como fallback si WebSocket falla:
const poller = new PresencePoller('chat-123', jwtToken);

poller.onChange((change) => {
  if (change.type === 'typing_start') {
    showTypingIndicator(change.participant.userId);
  } else if (change.type === 'status_changed') {
    updateStatusBadge(change.newStatus);
  }
});

poller.start();

// Cleanup:
// poller.stop();
```

### Ejemplo 4: Selector de estado manual (React)

```jsx
import React, { useState, useEffect } from 'react';

/**
 * Componente para que comerciales/visitantes cambien su estado manualmente
 */
export function StatusSelector({ userId, userType, jwtToken }) {
  const [currentStatus, setCurrentStatus] = useState('online');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Configuración según tipo de usuario
  const isCommercial = userType === 'commercial';
  const endpoint = isCommercial
    ? 'http://localhost:3000/v2/commercials/status'
    : 'http://localhost:3000/visitors/status';

  // Estados disponibles según tipo de usuario
  const availableStatuses = isCommercial
    ? [
        { value: 'online', label: 'En línea', icon: '🟢', color: '#10B981' },
        { value: 'busy', label: 'Ocupado', icon: '🔴', color: '#EF4444' },
        { value: 'away', label: 'Ausente', icon: '🟡', color: '#F59E0B' },
        { value: 'offline', label: 'Desconectado', icon: '⚫', color: '#6B7280' }
      ]
    : [
        { value: 'online', label: 'En línea', icon: '🟢', color: '#10B981' },
        { value: 'away', label: 'Ausente', icon: '🟡', color: '#F59E0B' },
        { value: 'offline', label: 'Desconectado', icon: '⚫', color: '#6B7280' }
      ];

  // Cambiar estado en el backend
  const changeStatus = async (newStatus) => {
    if (newStatus === currentStatus) return;

    setLoading(true);
    setError(null);

    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      // Comerciales usan JWT, visitantes usan cookies
      if (isCommercial) {
        headers['Authorization'] = `Bearer ${jwtToken}`;
      }

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers,
        credentials: isCommercial ? 'same-origin' : 'include',
        body: JSON.stringify({
          id: userId,
          status: newStatus
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al cambiar estado');
      }

      const result = await response.json();
      setCurrentStatus(newStatus);
      console.log('✅ Estado cambiado exitosamente:', result);

    } catch (err) {
      setError(err.message);
      console.error('❌ Error al cambiar estado:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#F9FAFB',
      borderRadius: '8px',
      maxWidth: '300px'
    }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
        Mi estado
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {availableStatuses.map((status) => (
          <button
            key={status.value}
            onClick={() => changeStatus(status.value)}
            disabled={loading || currentStatus === status.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              backgroundColor: currentStatus === status.value ? status.color + '20' : 'white',
              border: currentStatus === status.value ? `2px solid ${status.color}` : '2px solid transparent',
              borderRadius: '6px',
              cursor: currentStatus === status.value ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s',
              fontFamily: 'inherit',
              fontSize: '14px'
            }}
          >
            <span style={{ fontSize: '18px' }}>{status.icon}</span>
            <span style={{
              fontWeight: currentStatus === status.value ? '600' : '400',
              color: currentStatus === status.value ? status.color : '#374151'
            }}>
              {status.label}
            </span>
            {currentStatus === status.value && (
              <span style={{ marginLeft: 'auto', fontSize: '12px' }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          marginTop: '12px',
          padding: '8px',
          backgroundColor: '#FEE2E2',
          color: '#991B1B',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{
          marginTop: '12px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#6B7280'
        }}>
          Cambiando estado...
        </div>
      )}
    </div>
  );
}

// Uso en componente del chat:
function ChatSidebar() {
  const commercialId = 'e7f8a9b0-1234-5678-9abc-def012345678';
  const jwtToken = localStorage.getItem('authToken');

  return (
    <div>
      <StatusSelector
        userId={commercialId}
        userType="commercial"
        jwtToken={jwtToken}
      />
    </div>
  );
}
```

**Características del ejemplo:**
- ✅ Botones visuales con iconos y colores
- ✅ Estados disponibles según tipo de usuario
- ✅ Feedback visual del estado actual
- ✅ Manejo de errores
- ✅ Loading state durante el cambio
- ✅ Autenticación correcta (JWT para comerciales, cookies para visitantes)

---

## Sistema Automático de Detección de Estado

### 🔍 Cómo Funciona la Detección Automática

El sistema utiliza una combinación de **heartbeats**, **TTL en Redis** y **schedulers** para detectar automáticamente cambios de estado.

### **Para Comerciales:**

#### 📊 Timeline de Estados
```
t=0:     connect() → ONLINE (TTL: 10 min en Redis)
t=0-5m:  heartbeat() cada 30-60s → ONLINE
         ↓ lastActivity actualizado constantemente

t=5m:    [Scheduler detecta 5 min de inactividad]
         → Estado cambia a AWAY automáticamente
         → Emite evento presence:changed

t=10m:   [Scheduler detecta 10 min de inactividad]
         → Estado cambia a OFFLINE automáticamente
         → Redis TTL expira
         → Emite evento presence:changed
```

#### ⚙️ Mecanismos Técnicos

1. **Heartbeat (obligatorio)**
   ```javascript
   // Enviar cada 30-60 segundos
   setInterval(async () => {
     await fetch('/v2/commercials/heartbeat', {
       method: 'PUT',
       body: JSON.stringify({ commercialId })
     });
   }, 30000);
   ```

2. **Redis TTL**
   - Cada heartbeat renueva el TTL a 10 minutos
   - Si TTL expira → comercial desaparece de Redis → OFFLINE

3. **Inactivity Scheduler** (ejecuta cada 2 min)
   ```
   Para cada comercial online:
     inactiveTime = now - lastActivity

     if inactiveTime > 10 min:
       → marcar como OFFLINE
     else if inactiveTime > 5 min AND status == online:
       → marcar como AWAY
   ```

### **Para Visitantes:**

#### 📊 Timeline de Estados
```
t=0:     identify() → ONLINE automático (timeout: 15 min)
t=0-5m:  heartbeat() cada 30-60s → ONLINE
         ↓ lastActivity actualizado

t=5m:    [Scheduler detecta 5 min de inactividad]
         → Estado cambia a AWAY automáticamente
         → Emite evento presence:changed

t=15m:   [Scheduler detecta 15 min de inactividad]
         → Estado cambia a OFFLINE automáticamente
         → Emite evento presence:changed

t=20m:   [SessionCleanupScheduler cierra sesión expirada]
         → Sesión cerrada definitivamente
```

#### ⚙️ Mecanismos Técnicos

1. **Heartbeat (recomendado)**
   ```javascript
   // Enviar cada 30-60 segundos
   setInterval(async () => {
     await fetch('/visitors/session/heartbeat', {
       method: 'POST',
       credentials: 'include',
       body: JSON.stringify({ sessionId })
     });
   }, 30000);
   ```

2. **Session Timeout** (según lifecycle)
   - ANON: 5 min
   - ENGAGED: 15 min
   - LEAD: 30 min
   - CONVERTED: 60 min

3. **Inactivity Scheduler** (ejecuta cada 2 min)
   ```
   Para cada visitante online:
     inactiveTime = now - lastActivity

     if inactiveTime > 15 min:
       → marcar como OFFLINE
     else if inactiveTime > 5 min AND (status == online || chatting):
       → marcar como AWAY
   ```

4. **Session Cleanup Scheduler** (ejecuta cada 5 min)
   ```
   Para cada visitante con sesión activa:
     if now - lastActivity > sessionTimeout:
       → cerrar sesión definitivamente
       → marcar como OFFLINE
   ```

### 🎯 Diferencias Clave

| Aspecto | Comerciales | Visitantes |
|---------|-------------|------------|
| **Away threshold** | 5 minutos | 5 minutos |
| **Offline threshold** | 10 minutos | 15 minutos |
| **Scheduler frequency** | Cada 2 min | Cada 2 min |
| **Session cleanup** | No aplica | Cada 5 min |
| **Heartbeat obligatorio** | ✅ Sí | ⚠️ Recomendado |
| **TTL Redis** | 10 min | No aplica |

### ⚠️ Consideraciones Importantes

1. **Delay de Detección:**
   - Peor caso: threshold + 2 minutos
   - Ejemplo: Visitante away = 5 min inactividad + máx 2 min scheduler = **7 min total**

2. **Heartbeat Recomendado:**
   ```javascript
   // Enviar heartbeat cada 30 segundos
   // Previene marcado como away/offline inadecuado
   setInterval(sendHeartbeat, 30000);
   ```

3. **Eventos WebSocket:**
   ```javascript
   // Los cambios automáticos emiten eventos
   socket.on('presence:changed', (data) => {
     // data.status puede ser: 'online', 'away', 'offline'
     // data.previousStatus: estado anterior
     updateUI(data);
   });
   ```

4. **Deshabilitación:**
   ```bash
   # Para desarrollo/testing
   PRESENCE_INACTIVITY_ENABLED=false
   ```
   ⚠️ Si se deshabilita, los usuarios se quedarán en `online` indefinidamente.

---

## Mejores Prácticas

### 1. **Manejo de reconexión automática**

```javascript
socket.on('disconnect', (reason) => {
  console.warn('Desconectado:', reason);

  if (reason === 'io server disconnect') {
    // El servidor desconectó al cliente, reconectar manualmente
    socket.connect();
  }
  // Si es 'io client disconnect', fue desconexión intencional
  // Si es 'ping timeout' o 'transport error', Socket.IO reconecta automáticamente
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconectado después de', attemptNumber, 'intentos');

  // Re-unirse a las salas
  if (currentChatId) {
    socket.emit('chat:join', { chatId: currentChatId });
  }
});

socket.on('reconnect_error', (error) => {
  console.error('Error al reconectar:', error);
});
```

### 2. **Optimización de typing indicators**

```javascript
// ❌ MAL: Enviar en cada keystroke
input.addEventListener('keypress', () => {
  fetch('/api/presence/chat/123/typing/start', { method: 'POST' });
});

// ✅ BIEN: Con debounce
let typingTimeout;
let isTyping = false;

input.addEventListener('input', async () => {
  if (!isTyping) {
    isTyping = true;
    await fetch('/api/presence/chat/123/typing/start', { method: 'POST' });
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(async () => {
    isTyping = false;
    await fetch('/api/presence/chat/123/typing/stop', { method: 'POST' });
  }, 2000);
});
```

### 3. **Verificar disponibilidad antes de abrir chat**

```javascript
async function openChatWidget() {
  // Verificar si hay comerciales disponibles
  const availability = await fetch('/api/v2/commercials/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      domain: window.location.hostname,
      apiKey: 'ak_live_1234567890'
    })
  }).then(r => r.json());

  if (!availability.available) {
    // Mostrar formulario de contacto o mensaje de fuera de horario
    showOfflineForm();
  } else {
    // Abrir chat normal
    showChatWindow();
  }
}
```

### 4. **Limpieza adecuada de recursos**

```javascript
class ChatComponent {
  constructor() {
    this.socket = null;
    this.heartbeatInterval = null;
    this.typingTimeout = null;
  }

  mount() {
    // Inicializar recursos
    this.socket = io('http://localhost:3000');
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 60000);
  }

  unmount() {
    // Limpiar recursos
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }
}
```

### 5. **Manejo de errores en peticiones REST**

```javascript
async function safeTypingStart(chatId, authToken) {
  try {
    const response = await fetch(
      `http://localhost:3000/api/presence/chat/${chatId}/typing/start`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        console.error('Token expirado, reautenticar...');
        // Redirigir a login
      } else if (response.status === 404) {
        console.error('Chat no encontrado');
      } else {
        console.error('Error al enviar typing:', response.status);
      }
    }
  } catch (error) {
    console.error('Error de red:', error);
    // Intentar de nuevo o usar fallback
  }
}
```

---

## Troubleshooting

### Problema 1: No recibo eventos de WebSocket

**Diagnóstico:**

```javascript
socket.on('connect', () => console.log('✅ Conectado'));
socket.on('disconnect', () => console.log('❌ Desconectado'));
socket.on('connect_error', (err) => console.error('Error:', err));

// 🆕 Verificar auto-join
socket.on('presence:joined', (data) => {
  console.log('✅ Auto-join exitoso:', data);
  if (data.automatic) {
    console.log('✅ Sala personal configurada:', data.roomName);
  }
});

// Verificar si estoy en la sala del chat
socket.emit('chat:join', { chatId: 'chat-123' });

// Escuchar TODOS los eventos (debug)
socket.onAny((eventName, ...args) => {
  console.log('Evento recibido:', eventName, args);
});
```

**Soluciones:**

- ✅ Verificar que recibiste evento `presence:joined` con `automatic: true` (auto-join exitoso)
- ✅ Verificar que ejecutaste `socket.emit('chat:join', { chatId })` para la sala del chat
- ✅ Verificar que el `chatId` es correcto
- ✅ **NUEVO**: Verificar que tienes un chat activo con el otro usuario (eventos son filtrados)
- ✅ Verificar CORS en backend (`origin: '*'` en desarrollo)
- ✅ Verificar que el puerto es correcto (3000)

### 🆕 Problema 1.1: No recibo evento `presence:joined`

**Causa:** La autenticación puede haber fallado.

**Diagnóstico:**

```javascript
socket.on('connect', () => {
  console.log('✅ Conectado, esperando presence:joined...');

  // Si no recibes presence:joined en 2 segundos, algo falló
  setTimeout(() => {
    console.error('❌ No se recibió presence:joined, verificar autenticación');
  }, 2000);
});

socket.on('error', (error) => {
  console.error('❌ Error del socket:', error);
});
```

**Soluciones:**

- ✅ Comerciales: Verificar que el token JWT es válido y no expiró
- ✅ Visitantes: Verificar que las cookies se están enviando (`withCredentials: true`)
- ✅ Verificar en logs del backend si hay errores de autenticación

### 🆕 Problema 1.2: No recibo eventos `presence:changed` de un usuario específico

**Causa:** Los eventos ahora están filtrados por chats activos.

**Explicación:**

- **Comerciales**: Solo recibirás eventos de visitantes con los que tienes chats en estado PENDING, ASSIGNED, ACTIVE o TRANSFERRED
- **Visitantes**: Solo recibirás eventos del comercial asignado a tu chat activo

**Verificación:**

```javascript
// Verificar si tienes un chat activo con ese usuario
socket.on('presence:changed', (data) => {
  console.log('✅ Recibido evento de:', data.userId, data.userType);
});

// Si no recibes eventos:
// 1. Verificar que el chat existe y está activo (no CLOSED, no ABANDONED)
// 2. Verificar que el chat tiene un comercial asignado (para visitantes)
// 3. Verificar que el visitante pertenece al chat (para comerciales)
```

**Solución:**

- ✅ Esto es comportamiento normal del sistema optimizado
- ✅ Solo recibirás eventos relevantes para tus chats activos
- ❌ Ya NO se emite a toda la sala del tenant (esto era ineficiente)

---

### Problema 2: Typing indicator no se auto-expira

**Causa:** El TTL de Redis es 3 segundos, pero necesitas llamar a `/typing/stop` explícitamente.

**Solución:**
```javascript
// Siempre agregar timeout
let typingTimeout;
input.addEventListener('input', () => {
  startTyping();

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => stopTyping(), 2000); // Antes de los 3s
});
```

---

### Problema 3: Estado de presencia desincronizado

**Causa:** El polling puede estar desactualizado.

**Solución:** Combinar WebSocket + polling de respaldo:
```javascript
// WebSocket para actualizaciones en tiempo real
socket.on('presence:changed', updateStatus);

// Polling cada 30s como fallback
setInterval(async () => {
  const presence = await fetch('/api/presence/chat/123').then(r => r.json());
  updateStatus(presence);
}, 30000);
```

---

### Problema 4: Comercial se vuelve "offline" aunque está activo

**Causa:** Heartbeats no se están enviando o están fallando.

**Diagnóstico:**
```javascript
setInterval(async () => {
  try {
    const response = await fetch('/api/v2/commercials/heartbeat', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({ id: commercialId })
    });

    if (response.ok) {
      console.log('✅ Heartbeat OK');
    } else {
      console.error('❌ Heartbeat falló:', response.status);
    }
  } catch (error) {
    console.error('❌ Error en heartbeat:', error);
  }
}, 60000);
```

**Soluciones:**
- ✅ Verificar que el token JWT es válido
- ✅ Verificar que el intervalo es <= 60 segundos
- ✅ Implementar retry logic si falla

---

### Problema 5: Visitante no puede autenticarse con cookies

**Causa:** Cookies no se están enviando.

**Solución:**
```javascript
// En todas las peticiones REST
fetch('/api/presence/chat/123', {
  credentials: 'include' // ✅ MUY IMPORTANTE
});

// En Socket.IO
const socket = io('http://localhost:3000', {
  withCredentials: true // ✅ MUY IMPORTANTE
});

// Verificar en backend que CORS permite credentials:
// cors: {
//   origin: 'http://localhost:8080',
//   credentials: true
// }
```

---

## Resumen de URLs y Endpoints

| Endpoint | Método | Auth | Propósito |
|----------|--------|------|-----------|
| `/v2/commercials/connect` | POST | JWT | Conectar comercial |
| `/v2/commercials/heartbeat` | PUT | JWT | Mantener comercial activo |
| `/v2/commercials/availability` | POST | ApiKey | Verificar disponibilidad |
| `/presence/chat/:chatId` | GET | JWT/Cookie | Obtener presencia actual |
| `/presence/chat/:chatId/typing/start` | POST | JWT/Cookie | Indicar escribiendo |
| `/presence/chat/:chatId/typing/stop` | POST | JWT/Cookie | Dejar de escribir |
| WebSocket: `http://localhost:3000` | - | JWT/Cookie | Eventos en tiempo real |

---

## Recursos Adicionales

- **Código backend:** `src/context/conversations-v2/infrastructure/controllers/presence.controller.ts`
- **WebSocket Gateway:** `src/websocket/websocket.gateway.ts`
- **Event Handlers:** `src/context/conversations-v2/application/events/notify-*.event-handler.ts`
- **DTOs:** `src/context/conversations-v2/application/dtos/chat-presence.dto.ts`

---

## Contacto y Soporte

Si encuentras problemas o necesitas ayuda:
1. Revisa la sección de [Troubleshooting](#troubleshooting)
2. Verifica los logs del navegador (F12 → Console)
3. Verifica los logs del backend
4. Abre un issue en el repositorio

---

**Última actualización:** 2025-12-06
**Versión del backend:** conversations-v2
**Compatible con:** Socket.IO v4+
**Novedades:** Emisión dual granular por chat (`chatId`) + global (`affectedChatIds[]`)
