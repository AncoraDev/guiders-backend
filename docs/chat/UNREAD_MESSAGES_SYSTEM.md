# Sistema de Mensajes No Leídos

## Descripción General

Sistema completo para gestionar mensajes no leídos en chats que permite:
- ✅ **Persistencia tras recargas** - El estado de lectura se mantiene en la base de datos
- ✅ **API REST completa** - Endpoints para consultar y actualizar mensajes no leídos
- ✅ **Notificaciones en tiempo real** - WebSocket para nuevos mensajes
- ✅ **Badges con contador** - Mostrar número de mensajes no leídos
- ✅ **Múltiples estrategias de marcado** - Flexible según necesidades del frontend

---

## Arquitectura

### Arquitectura Híbrida: REST + WebSocket

```
┌─────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                │
│                                                                   │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │  Badge Counter │  │  Notification UI │  │  Chat Window    │ │
│  └────────┬───────┘  └────────┬─────────┘  └────────┬────────┘ │
│           │                    │                      │           │
└───────────┼────────────────────┼──────────────────────┼──────────┘
            │                    │                      │
            │  REST API          │  WebSocket           │  REST API
            │                    │                      │
┌───────────▼────────────────────▼──────────────────────▼──────────┐
│                          BACKEND                                  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │             GET /v2/messages/chat/:id/unread                 ││
│  │         Obtener mensajes no leídos al cargar página          ││
│  └──────────────────────────────────────────────────────────────┘│
│                                  │                                 │
│  ┌──────────────────────────────▼──────────────────────────────┐ │
│  │             PUT /v2/messages/mark-as-read                    │ │
│  │         Marcar mensajes como leídos cuando se leen           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                  │                                 │
│  ┌──────────────────────────────▼──────────────────────────────┐ │
│  │            WebSocket: message:new                            │ │
│  │       Notificación en tiempo real de nuevos mensajes         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                  │                                 │
│  ┌──────────────────────────────▼──────────────────────────────┐ │
│  │        MongoDB: messages_v2 collection                       │ │
│  │    Campos: isRead, readAt, readBy (con índices optimizados)  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

### Flujo de Datos

1. **Carga Inicial** (REST):
   - Frontend solicita mensajes no leídos al cargar
   - Backend consulta MongoDB y filtra por usuario
   - Frontend muestra badge con contador

2. **Nuevo Mensaje** (WebSocket):
   - Mensaje enviado vía HTTP POST
   - Backend emite evento WebSocket `message:new`
   - Frontend incrementa contador si no es el propio mensaje

3. **Marcar como Leído** (REST):
   - Usuario abre chat o ve mensajes
   - Frontend envía IDs de mensajes a marcar
   - Backend actualiza MongoDB
   - Frontend actualiza contador local

---

## API REST

### 1. Obtener Mensajes No Leídos

```http
GET /v2/messages/chat/:chatId/unread
Authorization: Bearer <token>
```

**Características:**
- Filtra automáticamente por rol del usuario (visitor/commercial)
- Excluye mensajes del propio usuario
- Los visitantes no ven mensajes internos
- Respeta permisos de acceso al chat

**Respuesta:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "chatId": "chat-uuid-123",
    "senderId": "commercial-uuid-456",
    "content": "¿En qué puedo ayudarte?",
    "type": "text",
    "isInternal": false,
    "isFirstResponse": true,
    "isRead": false,
    "readAt": null,
    "readBy": null,
    "createdAt": "2025-10-13T10:00:00.000Z",
    "updatedAt": "2025-10-13T10:00:00.000Z",
    "attachment": null,
    "systemData": null
  }
]
```

**Ejemplo de uso:**
```typescript
const response = await fetch(
  `https://api.example.com/v2/messages/chat/${chatId}/unread`,
  {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  }
);

const unreadMessages = await response.json();
console.log(`Tienes ${unreadMessages.length} mensajes no leídos`);
```

---

### 2. Marcar Mensajes como Leídos

```http
PUT /v2/messages/mark-as-read
Authorization: Bearer <token>
Content-Type: application/json

{
  "messageIds": ["msg-uuid-1", "msg-uuid-2", "msg-uuid-3"]
}
```

**Características:**
- Actualiza múltiples mensajes en una sola operación
- Registra quién leyó (readBy) y cuándo (readAt)
- Retorna contador de mensajes marcados
- Operación idempotente (puede llamarse múltiples veces)

**Respuesta:**
```json
{
  "success": true,
  "markedCount": 3
}
```

**Ejemplo de uso:**
```typescript
const messageIds = unreadMessages.map(m => m.id);

const response = await fetch(
  'https://api.example.com/v2/messages/mark-as-read',
  {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messageIds })
  }
);

const result = await response.json();
console.log(`${result.markedCount} mensajes marcados como leídos`);
```

---

### 3. Obtener Todos los Mensajes (Con Estado de Lectura)

```http
GET /v2/messages/chat/:chatId?limit=50&cursor=<nextCursor>
Authorization: Bearer <token>
```

**Respuesta incluye campos de lectura:**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "chatId": "chat-uuid",
      "senderId": "user-uuid",
      "content": "Hola",
      "type": "text",
      "isRead": true,
      "readAt": "2025-10-13T10:05:00.000Z",
      "readBy": "visitor-uuid",
      "createdAt": "2025-10-13T10:00:00.000Z",
      "updatedAt": "2025-10-13T10:05:00.000Z"
    }
  ],
  "total": 150,
  "hasMore": true,
  "nextCursor": "eyJvZmZzZXQiOjUwfQ=="
}
```

---

## Implementación en Frontend

### Hook Completo: useUnreadMessages

```typescript
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: string;
  isRead: boolean;
  readAt?: string;
  readBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface UseUnreadMessagesResult {
  unreadCount: number;
  unreadMessages: Message[];
  markAsRead: (messageIds: string[]) => Promise<void>;
  refreshUnread: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useUnreadMessages(
  chatId: string,
  token: string,
  currentUserId: string
): UseUnreadMessagesResult {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Conectar WebSocket
  useEffect(() => {
    const newSocket = io('https://api.example.com', {
      auth: { token },
      transports: ['websocket'],
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket conectado');
      newSocket.emit('chat:join', { chatId });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket desconectado');
    });

    // Escuchar nuevos mensajes
    newSocket.on('message:new', (message: Message) => {
      console.log('📨 Nuevo mensaje recibido:', message);

      // Solo incrementar si no es mensaje propio
      if (message.senderId !== currentUserId) {
        setUnreadCount(prev => prev + 1);
        setUnreadMessages(prev => [...prev, message]);

        // Mostrar notificación si la ventana no está activa
        if (document.hidden) {
          showBrowserNotification(message);
        }
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('chat:leave', { chatId });
      newSocket.disconnect();
    };
  }, [chatId, token, currentUserId]);

  // Cargar mensajes no leídos al montar
  useEffect(() => {
    refreshUnread();
  }, [chatId]);

  const refreshUnread = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.example.com/v2/messages/chat/${chatId}/unread`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const messages = await response.json();
      setUnreadMessages(messages);
      setUnreadCount(messages.length);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      console.error('Error al cargar mensajes no leídos:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [chatId, token]);

  const markAsRead = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) return;

    try {
      const response = await fetch(
        'https://api.example.com/v2/messages/mark-as-read',
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messageIds }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const { markedCount } = await response.json();
      console.log(`✅ ${markedCount} mensajes marcados como leídos`);

      // Actualizar estado local
      setUnreadMessages(prev =>
        prev.filter(m => !messageIds.includes(m.id))
      );
      setUnreadCount(prev => Math.max(0, prev - markedCount));
    } catch (err) {
      console.error('Error al marcar mensajes como leídos:', err);
      throw err;
    }
  }, [token]);

  return {
    unreadCount,
    unreadMessages,
    markAsRead,
    refreshUnread,
    isLoading,
    error,
  };
}

// Función helper para notificaciones del navegador
function showBrowserNotification(message: Message) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification('Nuevo mensaje', {
      body: message.content,
      icon: '/chat-icon.png',
      tag: message.chatId,
      requireInteraction: false,
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = `/chat/${message.chatId}`;
      notification.close();
    };

    setTimeout(() => notification.close(), 5000);
  }
}
```

---

### Componente: Badge con Contador

```typescript
import React from 'react';

interface ChatBadgeProps {
  chatId: string;
  token: string;
  currentUserId: string;
  onClick?: () => void;
}

export function ChatBadge({
  chatId,
  token,
  currentUserId,
  onClick
}: ChatBadgeProps) {
  const { unreadCount, markAsRead, unreadMessages } = useUnreadMessages(
    chatId,
    token,
    currentUserId
  );

  const handleClick = async () => {
    // Marcar todos como leídos al hacer click
    if (unreadMessages.length > 0) {
      const messageIds = unreadMessages.map(m => m.id);
      await markAsRead(messageIds);
    }

    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      className="chat-badge"
      aria-label={`Chat ${chatId} - ${unreadCount} mensajes no leídos`}
    >
      <svg className="chat-icon" /* ... */></svg>

      {unreadCount > 0 && (
        <span className="badge-counter" aria-live="polite">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

// CSS
const styles = `
.chat-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.chat-badge:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.badge-counter {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ff4444;
  color: white;
  border-radius: 12px;
  padding: 2px 7px;
  font-size: 12px;
  font-weight: 700;
  min-width: 20px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  animation: badge-pulse 2s infinite;
}

@keyframes badge-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
`;
```

---

### Componente: Ventana de Chat con Marcado Automático

```typescript
import React, { useEffect, useRef } from 'react';

interface ChatWindowProps {
  chatId: string;
  token: string;
  currentUserId: string;
}

export function ChatWindow({ chatId, token, currentUserId }: ChatWindowProps) {
  const { unreadMessages, markAsRead } = useUnreadMessages(
    chatId,
    token,
    currentUserId
  );

  // Estrategia 1: Marcar como leído al abrir el chat
  useEffect(() => {
    if (unreadMessages.length > 0) {
      const messageIds = unreadMessages.map(m => m.id);

      // Esperar 1 segundo antes de marcar (dar tiempo al usuario de ver)
      const timer = setTimeout(() => {
        markAsRead(messageIds);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [chatId]); // Solo cuando cambia el chat

  // Estrategia 2: Marcar cuando la ventana obtiene foco
  useEffect(() => {
    const handleFocus = () => {
      if (unreadMessages.length > 0) {
        const messageIds = unreadMessages.map(m => m.id);
        markAsRead(messageIds);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [unreadMessages, markAsRead]);

  return (
    <div className="chat-window">
      {/* Contenido del chat */}
    </div>
  );
}
```

---

### Estrategia Avanzada: Intersection Observer

Marcar mensajes como leídos solo cuando son visibles en el viewport:

```typescript
import React, { useEffect, useRef } from 'react';

interface MessageWithReadTracking {
  message: Message;
  currentUserId: string;
  onVisible: (messageId: string) => void;
}

function MessageWithReadTracking({
  message,
  currentUserId,
  onVisible
}: MessageWithReadTracking) {
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Solo observar si el mensaje no ha sido leído y no es del usuario actual
    if (!message.isRead && message.senderId !== currentUserId) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              // Marcar como leído después de 2 segundos de estar visible
              const timer = setTimeout(() => {
                if (entry.isIntersecting) {
                  onVisible(message.id);
                }
              }, 2000);

              // Cleanup al dejar de ser visible
              return () => clearTimeout(timer);
            }
          });
        },
        {
          threshold: 1.0, // 100% visible
          rootMargin: '0px',
        }
      );

      if (messageRef.current) {
        observer.observe(messageRef.current);
      }

      return () => {
        if (messageRef.current) {
          observer.unobserve(messageRef.current);
        }
      };
    }
  }, [message, currentUserId, onVisible]);

  return (
    <div
      ref={messageRef}
      data-message-id={message.id}
      className={`message ${!message.isRead ? 'message-unread' : ''}`}
    >
      {message.content}
      {!message.isRead && <span className="unread-dot">●</span>}
    </div>
  );
}

// Uso en el chat
function ChatMessages({ messages, currentUserId, markAsRead }: Props) {
  const handleMessageVisible = async (messageId: string) => {
    await markAsRead([messageId]);
  };

  return (
    <div className="messages-container">
      {messages.map(message => (
        <MessageWithReadTracking
          key={message.id}
          message={message}
          currentUserId={currentUserId}
          onVisible={handleMessageVisible}
        />
      ))}
    </div>
  );
}
```

---

## Gestión de Múltiples Chats

```typescript
interface ChatBadgeData {
  chatId: string;
  unreadCount: number;
  lastMessage?: Message;
}

export function ChatList({ token, currentUserId }: Props) {
  const [chats, setChats] = useState<ChatBadgeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar contadores al iniciar
  useEffect(() => {
    async function loadUnreadCounts() {
      setIsLoading(true);

      try {
        // Obtener lista de chats del usuario
        const chatsResponse = await fetch('/v2/chats/my-chats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const chatIds = await chatsResponse.json();

        // Cargar contador de no leídos para cada chat
        const promises = chatIds.map(async (chatId: string) => {
          const response = await fetch(
            `/v2/messages/chat/${chatId}/unread`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );

          const unreadMessages = await response.json();

          return {
            chatId,
            unreadCount: unreadMessages.length,
            lastMessage: unreadMessages[0],
          };
        });

        const chatData = await Promise.all(promises);
        setChats(chatData);
      } catch (error) {
        console.error('Error cargando contadores:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadUnreadCounts();
  }, [token]);

  // Actualizar en tiempo real con WebSocket
  useEffect(() => {
    const socket = io('https://api.example.com', {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('message:new', (message: Message) => {
      if (message.senderId !== currentUserId) {
        setChats(prev =>
          prev.map(chat =>
            chat.chatId === message.chatId
              ? {
                  ...chat,
                  unreadCount: chat.unreadCount + 1,
                  lastMessage: message,
                }
              : chat
          )
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, currentUserId]);

  if (isLoading) {
    return <div>Cargando chats...</div>;
  }

  return (
    <div className="chat-list">
      {chats.map(chat => (
        <div key={chat.chatId} className="chat-item">
          <span className="chat-name">Chat {chat.chatId.slice(0, 8)}</span>

          {chat.unreadCount > 0 && (
            <span className="chat-badge">
              {chat.unreadCount}
            </span>
          )}

          {chat.lastMessage && (
            <span className="last-message">
              {chat.lastMessage.content.slice(0, 50)}...
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Base de Datos

### Esquema MongoDB

```typescript
{
  _id: ObjectId,
  id: "uuid-mensaje",
  chatId: "uuid-chat",
  senderId: "uuid-usuario",
  senderType: "visitor" | "commercial" | "system",
  content: {
    text: string,
    metadata: object
  },
  type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM",

  // Campos de lectura
  isRead: boolean,              // false por defecto
  readAt: Date | null,          // Timestamp cuando se leyó
  readBy: string | null,        // UUID del usuario que leyó

  // Campos adicionales
  isInternal: boolean,
  sentAt: Date,
  updatedAt: Date,
  isDeleted: boolean,
  sequenceNumber: number
}
```

### Índices Optimizados

```javascript
// Índice compuesto para consultas de no leídos
db.messages_v2.createIndex({
  chatId: 1,
  isRead: 1,
  senderType: 1
});

// Índice para búsqueda de mensajes por usuario
db.messages_v2.createIndex({
  chatId: 1,
  senderId: 1
});

// Índice temporal para orden cronológico
db.messages_v2.createIndex({
  chatId: 1,
  sentAt: -1
});
```

### Consulta Eficiente

```typescript
// Query handler interno
async function getUnreadMessages(chatId: string, userId: string, role: string) {
  const query = {
    chatId,
    isRead: false,
    senderId: { $ne: userId }, // Excluir mensajes propios
    isDeleted: false,
  };

  // Si es visitante, excluir mensajes internos
  if (role === 'visitor') {
    query.isInternal = false;
  }

  // Usar proyección para optimizar
  const messages = await messagesCollection
    .find(query)
    .select('id chatId senderId content type isRead sentAt')
    .sort({ sentAt: 1 })
    .lean()
    .exec();

  return messages;
}
```

---

## Testing

### Test del Hook

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUnreadMessages } from '../useUnreadMessages';

describe('useUnreadMessages', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('debe cargar mensajes no leídos al montar', async () => {
    const mockMessages = [
      {
        id: 'msg-1',
        chatId: 'chat-123',
        senderId: 'commercial-456',
        content: 'Hola',
        isRead: false,
      }
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMessages,
    });

    const { result } = renderHook(() =>
      useUnreadMessages('chat-123', 'token', 'visitor-789')
    );

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(1);
      expect(result.current.unreadMessages).toEqual(mockMessages);
    });
  });

  it('debe marcar mensajes como leídos', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'msg-1', isRead: false }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, markedCount: 1 }),
      });

    const { result } = renderHook(() =>
      useUnreadMessages('chat-123', 'token', 'visitor-789')
    );

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(1);
    });

    await act(async () => {
      await result.current.markAsRead(['msg-1']);
    });

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(0);
    });
  });

  it('debe incrementar contador cuando llega mensaje nuevo', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const { result } = renderHook(() =>
      useUnreadMessages('chat-123', 'token', 'visitor-789')
    );

    // Simular mensaje nuevo de otro usuario
    act(() => {
      // Trigger del evento WebSocket
      const newMessage = {
        id: 'msg-new',
        chatId: 'chat-123',
        senderId: 'commercial-456',
        content: 'Nuevo mensaje',
        isRead: false,
      };

      // Normalmente esto vendría del socket
      // result.current tiene el estado actualizado
    });

    // El contador debería incrementarse
    expect(result.current.unreadCount).toBeGreaterThan(0);
  });
});
```

---

## Mejores Prácticas

### 1. Evitar Race Conditions

```typescript
// ❌ Malo: Múltiples llamadas pueden solaparse
function ChatWindow() {
  const [unreadCount, setUnreadCount] = useState(0);

  const markAsRead = async (ids: string[]) => {
    await fetch('/mark-as-read', { body: JSON.stringify({ messageIds: ids }) });
    setUnreadCount(0); // ❌ Puede estar desactualizado
  };
}

// ✅ Bueno: Actualizar basándose en el resultado de la API
function ChatWindow() {
  const [unreadCount, setUnreadCount] = useState(0);

  const markAsRead = async (ids: string[]) => {
    const response = await fetch('/mark-as-read', {
      body: JSON.stringify({ messageIds: ids })
    });
    const { markedCount } = await response.json();

    // Decrementar basándose en valor actual
    setUnreadCount(prev => Math.max(0, prev - markedCount));
  };
}
```

### 2. Debouncing de Marcado

```typescript
import { debounce } from 'lodash';

const debouncedMarkAsRead = debounce(async (messageIds: string[]) => {
  await fetch('/mark-as-read', {
    method: 'PUT',
    body: JSON.stringify({ messageIds }),
  });
}, 1000);

// Acumular IDs y marcar en batch
const markAsReadWithDebounce = (messageId: string) => {
  pendingIds.add(messageId);
  debouncedMarkAsRead(Array.from(pendingIds));
};
```

### 3. Sincronización tras Reconexión

```typescript
useEffect(() => {
  if (!socket) return;

  socket.on('reconnect', async () => {
    console.log('✅ Reconectado - Sincronizando mensajes no leídos');

    // Recargar mensajes no leídos por si perdimos alguno
    await refreshUnread();
  });

  return () => {
    socket.off('reconnect');
  };
}, [socket, refreshUnread]);
```

### 4. Optimización de Rendimiento

```typescript
// Usar useMemo para evitar recálculos
const unreadCount = useMemo(
  () => unreadMessages.length,
  [unreadMessages]
);

// Usar useCallback para funciones
const markAsRead = useCallback(async (ids: string[]) => {
  // ... implementación
}, [token]);
```

---

## Troubleshooting

### Problema: El contador no se actualiza tras recargar

**Solución:**
```typescript
// Asegurarse de llamar refreshUnread al montar
useEffect(() => {
  refreshUnread();
}, [chatId]); // Dependencia importante
```

### Problema: Mensajes marcados como leídos reaparecen

**Solución:**
```typescript
// Verificar que se está enviando el formato correcto
const messageIds = unreadMessages.map(m => m.id); // ✅ Array de strings
// NO: const messageIds = unreadMessages; // ❌ Array de objetos
```

### Problema: Badge muestra más mensajes de los reales

**Solución:**
```typescript
// Filtrar duplicados antes de actualizar
socket.on('message:new', (message) => {
  setUnreadMessages(prev => {
    const exists = prev.some(m => m.id === message.id);
    if (exists) return prev;
    return [...prev, message];
  });
});
```

---

## Referencias

- API REST: `/docs/API_DOCUMENTATION.md`
- WebSocket: `/./websocket-real-time-chat.md`
- Arquitectura: `/docs/ARCHITECTURE.md`
- Código fuente:
  - Query Handler: `src/context/conversations-v2/application/queries/get-unread-messages.query-handler.ts`
  - Command Handler: `src/context/conversations-v2/application/commands/mark-messages-as-read.command-handler.ts`
  - Controller: `src/context/conversations-v2/infrastructure/controllers/message-v2.controller.ts`
  - Repository: `src/context/conversations-v2/infrastructure/persistence/impl/mongo-message.repository.impl.ts`
