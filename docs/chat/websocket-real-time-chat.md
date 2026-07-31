# Sistema de Comunicación en Tiempo Real (WebSocket)

## Descripción General

Sistema bidireccional de comunicación en tiempo real entre visitantes y comerciales que permite:
- ✅ **Recepción instantánea** de mensajes nuevos via WebSocket
- ✅ **Envío de mensajes** via HTTP POST (endpoint REST)
- ✅ **Salas de chat** para agrupar participantes
- ✅ **Salas de visitantes** para notificaciones proactivas (NUEVO)
- ✅ **Notificaciones de chats creados** por comerciales (NUEVO)
- ✅ **Autenticación dual**: JWT Bearer token y cookies de sesión
- ✅ **Mensajes internos** solo visibles para comerciales
- ✅ **Notificaciones de estado** del chat (IN_PROGRESS, etc.)

---

## Arquitectura del Sistema

### Flujo de Mensajes

```
┌─────────────────┐       HTTP POST        ┌──────────────────┐
│   Frontend      │ ──────────────────────> │   Backend API    │
│ (Visitante o    │                         │  /v2/messages    │
│  Comercial)     │                         └──────────────────┘
└─────────────────┘                                   │
        ▲                                             │ MessageSentEvent
        │                                             ▼
        │                                  ┌──────────────────────┐
        │      WebSocket Notification      │  Event Handler       │
        │ <─────────────────────────────── │  (Notify WS)         │
        │         message:new              └──────────────────────┘
        │                                             │
        │                                             ▼
        │                                  ┌──────────────────────┐
        └──────────────────────────────────│  WebSocket Gateway   │
                   Sala: chat:{chatId}     │  (Socket.IO)         │
                                           └──────────────────────┘
```

### Componentes Clave

1. **WebSocket Gateway** (`src/websocket/websocket.gateway.ts`)
   - Gestiona conexiones WebSocket
   - Maneja salas de chat
   - Emite notificaciones a participantes

2. **Event Handler** (`notify-message-sent-on-message-sent.event-handler.ts`)
   - Escucha eventos `MessageSentEvent`
   - Notifica via WebSocket a salas correspondientes
   - Gestiona mensajes internos (solo comerciales)

3. **SendMessageCommandHandler** (`send-message.command-handler.ts`)
   - Procesa envío de mensajes via HTTP
   - Emite evento de dominio `MessageSentEvent`
   - Retorna respuesta HTTP al cliente

---

## Integración Frontend

### 1. Instalación Socket.IO Client

```bash
npm install socket.io-client
# o
yarn add socket.io-client
```

### 2. Conexión al WebSocket

#### Opción A: Con JWT Bearer Token (Comerciales)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  auth: {
    token: 'tu_jwt_token_aqui'
  },
  withCredentials: true
});

socket.on('connect', () => {
  console.log('✅ Conectado al WebSocket:', socket.id);
});

socket.on('welcome', (data) => {
  console.log('Mensaje de bienvenida:', data);
});
```

#### Opción B: Con Cookies de Sesión (Visitantes)

```javascript
import { io } from 'socket.io-client';

// Las cookies se envían automáticamente con withCredentials: true
const socket = io('http://localhost:3000', {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  withCredentials: true // Envía cookies automáticamente
});

socket.on('connect', () => {
  console.log('✅ Conectado al WebSocket:', socket.id);
});
```

### 3. Unirse a una Sala de Visitante (NUEVO - Para Notificaciones Proactivas)

```javascript
// IMPORTANTE: Hacer esto ANTES de unirse a salas de chat específicas
// Esto permite recibir notificaciones cuando un comercial crea un chat para ti

// Obtener el visitorId (normalmente del contexto de autenticación)
const visitorId = 'visitor-uuid-456';

socket.emit('visitor:join', { visitorId }, (response) => {
  if (response.success) {
    console.log('✅ Unido a sala de visitante:', response.roomName);
    // roomName: "visitor:visitor-uuid-456"
  } else {
    console.error('❌ Error al unirse a sala de visitante:', response.message);
  }
});

// Escuchar confirmación
socket.on('visitor:joined', (data) => {
  console.log('Confirmación de sala de visitante:', data);
  // { visitorId, roomName, timestamp }
});

// Escuchar cuando un comercial crea un chat para ti
socket.on('chat:created', (data) => {
  console.log('🎉 Un comercial ha iniciado un chat contigo:', data);
  // {
  //   chatId: 'chat-uuid-789',
  //   visitorId: 'visitor-uuid-456',
  //   status: 'ASSIGNED',
  //   priority: 'NORMAL',
  //   visitorInfo: { name: 'Juan', email: 'juan@example.com' },
  //   metadata: { department: 'ventas' },
  //   createdAt: '2025-10-13T10:00:00.000Z',
  //   message: 'Un comercial ha iniciado una conversación contigo'
  // }

  // Ahora puedes unirte automáticamente al chat
  socket.emit('chat:join', { chatId: data.chatId });

  // Mostrar notificación al usuario
  showNotification('Tienes un nuevo chat con un comercial!');

  // Redirigir a la sala de chat
  navigateToChat(data.chatId);
});
```

### 4. Unirse a una Sala de Chat

```javascript
// Unirse a la sala del chat para recibir mensajes
socket.emit('chat:join', { chatId: 'chat-uuid-123' }, (response) => {
  if (response.success) {
    console.log('✅ Unido a la sala:', response.roomName);
  } else {
    console.error('❌ Error al unirse:', response.message);
  }
});

// Escuchar confirmación
socket.on('chat:joined', (data) => {
  console.log('Confirmación de unión:', data);
  // { chatId, roomName, timestamp }
});
```

### 5. Escuchar Mensajes Nuevos

```javascript
// Escuchar mensajes nuevos en tiempo real
socket.on('message:new', (message) => {
  console.log('📨 Nuevo mensaje recibido:', message);
  
  // Estructura del mensaje:
  // {
  //   messageId: string,
  //   chatId: string,
  //   senderId: string,
  //   content: string,
  //   type: 'text' | 'image' | 'file',
  //   isInternal: boolean,
  //   isFirstResponse: boolean,
  //   sentAt: string (ISO 8601),
  //   attachment?: { url, fileName, fileSize, mimeType }
  // }
  
  // Actualizar UI con el nuevo mensaje
  actualizarListaDeMensajes(message);
});
```

### 6. Escuchar Cambios de Estado del Chat

```javascript
// Escuchar cuando el chat cambia de estado
socket.on('chat:status', (data) => {
  console.log('Estado del chat actualizado:', data);
  // { chatId, status: 'IN_PROGRESS', timestamp }
  
  if (data.status === 'IN_PROGRESS') {
    mostrarNotificacion('Un comercial ha respondido tu consulta');
  }
});
```

### 7. Enviar un Mensaje (via HTTP)

```javascript
// IMPORTANTE: Los mensajes se envían via HTTP, NO via WebSocket
async function enviarMensaje(chatId, contenido) {
  const response = await fetch('http://localhost:3000/v2/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer tu_jwt_token' // O usar cookies
    },
    credentials: 'include', // Para enviar cookies
    body: JSON.stringify({
      chatId: chatId,
      content: contenido,
      type: 'text'
    })
  });
  
  const mensaje = await response.json();
  console.log('Mensaje enviado:', mensaje);
  
  // La notificación llegará automáticamente via WebSocket
  // a todos los participantes del chat
}
```

### 8. Salir de una Sala de Chat

```javascript
socket.emit('chat:leave', { chatId: 'chat-uuid-123' }, (response) => {
  if (response.success) {
    console.log('✅ Saliste de la sala exitosamente');
  }
});

socket.on('chat:left', (data) => {
  console.log('Confirmación de salida:', data);
});
```

### 9. Salir de una Sala de Visitante

```javascript
// Si el visitante quiere dejar de recibir notificaciones proactivas
socket.emit('visitor:leave', { visitorId: 'visitor-uuid-456' }, (response) => {
  if (response.success) {
    console.log('✅ Saliste de la sala de visitante');
  }
});

socket.on('visitor:left', (data) => {
  console.log('Confirmación de salida de sala de visitante:', data);
  // { visitorId, roomName, timestamp }
});
```

### 10. Manejo de Desconexión

```javascript
socket.on('disconnect', (reason) => {
  console.log('❌ Desconectado:', reason);
  
  if (reason === 'io server disconnect') {
    // El servidor desconectó al cliente, reconectar manualmente
    socket.connect();
  }
  // En otros casos, socket.io reconecta automáticamente
});

socket.on('connect_error', (error) => {
  console.error('Error de conexión:', error);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('✅ Reconectado después de', attemptNumber, 'intentos');
  
  // Re-unirse a las salas de chat activas
  reJoinActiveChats();
});
```

---

## Ejemplo Completo: React Hook Personalizado

```typescript
// hooks/useRealtimeChat.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  messageId: string;
  chatId: string;
  senderId: string;
  content: string;
  type: string;
  sentAt: string;
}

export function useRealtimeChat(chatId: string, token?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Crear conexión WebSocket
    const newSocket = io('http://localhost:3000', {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
      withCredentials: true,
    });

    // Eventos de conexión
    newSocket.on('connect', () => {
      console.log('✅ Conectado');
      setIsConnected(true);
      
      // Unirse automáticamente a la sala del chat
      newSocket.emit('chat:join', { chatId });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Desconectado');
      setIsConnected(false);
    });

    // Escuchar mensajes nuevos
    newSocket.on('message:new', (message: Message) => {
      console.log('📨 Nuevo mensaje:', message);
      setMessages(prev => [...prev, message]);
    });

    // Escuchar cambios de estado
    newSocket.on('chat:status', (data) => {
      console.log('Estado actualizado:', data);
    });

    setSocket(newSocket);

    // Cleanup al desmontar
    return () => {
      newSocket.emit('chat:leave', { chatId });
      newSocket.disconnect();
    };
  }, [chatId, token]);

  // Función para enviar mensaje (via HTTP)
  const sendMessage = async (content: string) => {
    const response = await fetch('http://localhost:3000/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      credentials: 'include',
      body: JSON.stringify({
        chatId,
        content,
        type: 'text',
      }),
    });

    return response.json();
  };

  return {
    socket,
    messages,
    isConnected,
    sendMessage,
  };
}
```

### Uso del Hook en un Componente

```typescript
// components/ChatRoom.tsx
import React, { useState } from 'react';
import { useRealtimeChat } from '../hooks/useRealtimeChat';

export function ChatRoom({ chatId, token }: { chatId: string; token: string }) {
  const [inputMessage, setInputMessage] = useState('');
  const { messages, isConnected, sendMessage } = useRealtimeChat(chatId, token);

  const handleSend = async () => {
    if (!inputMessage.trim()) return;
    
    await sendMessage(inputMessage);
    setInputMessage('');
  };

  return (
    <div>
      <div>Estado: {isConnected ? '🟢 Conectado' : '🔴 Desconectado'}</div>
      
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.messageId}>
            <strong>{msg.senderId}:</strong> {msg.content}
          </div>
        ))}
      </div>
      
      <div className="input-area">
        <input
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Escribe un mensaje..."
        />
        <button onClick={handleSend}>Enviar</button>
      </div>
    </div>
  );
}
```

---

## Patrones Avanzados para Producción

### 1. Optimistic Updates (Actualización Optimista)

Mostrar el mensaje inmediatamente en la UI mientras se envía al servidor:

```typescript
// hooks/useOptimisticMessages.ts
import { useState } from 'react';

interface Message {
  messageId: string;
  chatId: string;
  content: string;
  type: string;
  sentAt: string;
  status?: 'sending' | 'sent' | 'failed';
}

export function useOptimisticMessages(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  const addOptimisticMessage = (content: string) => {
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      messageId: tempId,
      chatId,
      content,
      type: 'text',
      sentAt: new Date().toISOString(),
      status: 'sending',
    };

    setMessages(prev => [...prev, optimisticMessage]);
    return tempId;
  };

  const confirmMessage = (tempId: string, serverMessage: Message) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.messageId === tempId
          ? { ...serverMessage, status: 'sent' }
          : msg
      )
    );
  };

  const failMessage = (tempId: string) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.messageId === tempId
          ? { ...msg, status: 'failed' }
          : msg
      )
    );
  };

  const retryMessage = async (messageId: string) => {
    const message = messages.find(m => m.messageId === messageId);
    if (!message) return;

    // Cambiar estado a "enviando" nuevamente
    setMessages(prev =>
      prev.map(msg =>
        msg.messageId === messageId
          ? { ...msg, status: 'sending' }
          : msg
      )
    );

    return message;
  };

  return {
    messages,
    setMessages,
    addOptimisticMessage,
    confirmMessage,
    failMessage,
    retryMessage,
  };
}
```

### 2. Hook Completo con Optimistic Updates

```typescript
// hooks/useRealtimeChatAdvanced.ts
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useOptimisticMessages } from './useOptimisticMessages';

export function useRealtimeChatAdvanced(chatId: string, token?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const {
    messages,
    setMessages,
    addOptimisticMessage,
    confirmMessage,
    failMessage,
    retryMessage,
  } = useOptimisticMessages(chatId);

  // Cargar historial de mensajes al inicio
  useEffect(() => {
    const loadHistory = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `http://localhost:3000/v2/messages/chat/${chatId}?limit=50`,
          {
            credentials: 'include',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          }
        );

        if (!response.ok) {
          throw new Error('Error al cargar historial');
        }

        const data = await response.json();
        setMessages(data.messages || []);
      } catch (error) {
        console.error('Error cargando historial:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [chatId, token]);

  // Conectar WebSocket
  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
      withCredentials: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('✅ Conectado al WebSocket');
      setIsConnected(true);
      newSocket.emit('chat:join', { chatId });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Desconectado del WebSocket');
      setIsConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('✅ Reconectado después de', attemptNumber, 'intentos');
      
      // Re-unirse a la sala
      newSocket.emit('chat:join', { chatId });
      
      // Sincronizar mensajes perdidos
      syncMessagesSinceLastReceived();
    });

    // Escuchar mensajes nuevos
    newSocket.on('message:new', (message) => {
      console.log('📨 Nuevo mensaje recibido:', message);
      
      // Solo agregar si no existe (evitar duplicados)
      setMessages(prev => {
        const exists = prev.some(m => m.messageId === message.messageId);
        if (exists) return prev;
        return [...prev, { ...message, status: 'sent' }];
      });
    });

    newSocket.on('chat:status', (data) => {
      console.log('Estado del chat actualizado:', data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('chat:leave', { chatId });
      newSocket.disconnect();
    };
  }, [chatId, token]);

  // Sincronizar mensajes perdidos durante desconexión
  const syncMessagesSinceLastReceived = useCallback(async () => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    const lastMessageTime = lastMessage.sentAt;

    try {
      const response = await fetch(
        `http://localhost:3000/v2/messages/chat/${chatId}?dateFrom=${lastMessageTime}&limit=100`,
        {
          credentials: 'include',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        }
      );

      if (response.ok) {
        const data = await response.json();
        const newMessages = data.messages || [];
        
        // Agregar solo mensajes que no tenemos
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.messageId));
          const missingMessages = newMessages.filter(
            (m: any) => !existingIds.has(m.messageId)
          );
          return [...prev, ...missingMessages];
        });
      }
    } catch (error) {
      console.error('Error sincronizando mensajes:', error);
    }
  }, [chatId, messages, token]);

  // Enviar mensaje con optimistic update
  const sendMessage = useCallback(async (content: string, type: string = 'text') => {
    if (!content.trim()) return;

    // 1. Agregar mensaje optimistamente
    const tempId = addOptimisticMessage(content);

    try {
      // 2. Enviar al servidor
      const response = await fetch('http://localhost:3000/v2/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          chatId,
          content,
          type,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al enviar mensaje');
      }

      const serverMessage = await response.json();

      // 3. Confirmar mensaje con datos del servidor
      confirmMessage(tempId, serverMessage);

      return serverMessage;
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      
      // 4. Marcar mensaje como fallido
      failMessage(tempId);
      
      throw error;
    }
  }, [chatId, token, addOptimisticMessage, confirmMessage, failMessage]);

  // Reintentar mensaje fallido
  const retryFailedMessage = useCallback(async (messageId: string) => {
    const message = await retryMessage(messageId);
    if (!message) return;

    try {
      await sendMessage(message.content, message.type);
    } catch (error) {
      console.error('Error al reintentar mensaje:', error);
    }
  }, [sendMessage, retryMessage]);

  return {
    socket,
    messages,
    isConnected,
    isLoading,
    sendMessage,
    retryFailedMessage,
  };
}
```

### 3. Componente de Chat con Estados de Mensaje

```typescript
// components/ChatMessage.tsx
import React from 'react';

interface Message {
  messageId: string;
  content: string;
  senderId: string;
  status?: 'sending' | 'sent' | 'failed';
  attachment?: {
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
}

interface ChatMessageProps {
  message: Message;
  isOwn: boolean;
  onRetry?: (messageId: string) => void;
}

export function ChatMessage({ message, isOwn, onRetry }: ChatMessageProps) {
  const getStatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return '⏳';
      case 'sent':
        return '✓';
      case 'failed':
        return '❌';
      default:
        return '';
    }
  };

  return (
    <div className={`message ${isOwn ? 'message-own' : 'message-other'}`}>
      <div className="message-content">
        {message.content}
        
        {message.attachment && (
          <div className="message-attachment">
            <a 
              href={message.attachment.url} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              📎 {message.attachment.fileName}
            </a>
          </div>
        )}
      </div>
      
      <div className="message-status">
        <span className="status-icon">{getStatusIcon()}</span>
        
        {message.status === 'failed' && onRetry && (
          <button 
            onClick={() => onRetry(message.messageId)}
            className="retry-button"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
```

### 4. Componente Completo de Sala de Chat

```typescript
// components/AdvancedChatRoom.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useRealtimeChatAdvanced } from '../hooks/useRealtimeChatAdvanced';
import { ChatMessage } from './ChatMessage';

interface AdvancedChatRoomProps {
  chatId: string;
  token?: string;
  currentUserId: string;
}

export function AdvancedChatRoom({ chatId, token, currentUserId }: AdvancedChatRoomProps) {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    messages,
    isConnected,
    isLoading,
    sendMessage,
    retryFailedMessage,
  } = useRealtimeChatAdvanced(chatId, token);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Solicitar permiso para notificaciones
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Mostrar notificación si la ventana no está activa
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      if (
        document.hidden &&
        lastMessage.senderId !== currentUserId &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        new Notification('Nuevo mensaje', {
          body: lastMessage.content,
          icon: '/chat-icon.png',
          tag: chatId,
        });
      }
    }
  }, [messages, chatId, currentUserId]);

  const handleSend = async () => {
    if (!inputMessage.trim()) return;
    
    try {
      await sendMessage(inputMessage);
      setInputMessage('');
    } catch (error) {
      console.error('Error:', error);
      // El mensaje ya está marcado como fallido por el hook
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="chat-loading">
        <p>Cargando mensajes...</p>
      </div>
    );
  }

  return (
    <div className="chat-room">
      {/* Header */}
      <div className="chat-header">
        <h3>Chat {chatId}</h3>
        <div className="connection-status">
          {isConnected ? (
            <span className="status-online">🟢 Conectado</span>
          ) : (
            <span className="status-offline">🔴 Desconectado</span>
          )}
        </div>
      </div>

      {/* Lista de mensajes */}
      <div className="messages-list">
        {messages.map(message => (
          <ChatMessage
            key={message.messageId}
            message={message}
            isOwn={message.senderId === currentUserId}
            onRetry={retryFailedMessage}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de mensaje */}
      <div className="message-input">
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Escribe un mensaje..."
          disabled={!isConnected}
          rows={2}
        />
        <button 
          onClick={handleSend}
          disabled={!isConnected || !inputMessage.trim()}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
```

---

## Mensajes Internos (Solo Comerciales)

Los **mensajes internos** son notas privadas que solo ven los comerciales:

### Backend: Enviar Mensaje Interno

```bash
curl -X POST http://localhost:3000/v2/messages \
  -H "Content-Type: application/json" \
  -H "Cookie: console_session=..." \
  -d '{
    "chatId": "chat-uuid-123",
    "content": "Cliente VIP - Priorizar atención",
    "type": "text",
    "isInternal": true
  }'
```

### Frontend: Escuchar Solo si Eres Comercial

```javascript
// Solo comerciales deberían unirse a la sala de mensajes internos
if (esComercial) {
  socket.emit('chat:join', { 
    chatId: `chat:${chatId}:commercial` 
  });
  
  socket.on('message:new', (message) => {
    if (message.isInternal) {
      mostrarMensajeInterno(message);
    }
  });
}
```

---

## Gestión de Múltiples Chats

### Hook para Múltiples Chats Simultáneos

```typescript
// hooks/useMultipleChats.ts
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  messageId: string;
  chatId: string;
  content: string;
  senderId: string;
  sentAt: string;
}

interface ChatState {
  messages: Message[];
  unreadCount: number;
  isTyping: boolean;
}

export function useMultipleChats(chatIds: string[], token?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const [activeChat, setActiveChat] = useState<string | null>(null);

  // Inicializar estado de chats
  useEffect(() => {
    const initialChats: Record<string, ChatState> = {};
    chatIds.forEach(chatId => {
      initialChats[chatId] = {
        messages: [],
        unreadCount: 0,
        isTyping: false,
      };
    });
    setChats(initialChats);
  }, [chatIds]);

  // Conectar WebSocket
  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      console.log('✅ Conectado, uniéndose a', chatIds.length, 'chats');
      
      // Unirse a todas las salas
      chatIds.forEach(chatId => {
        newSocket.emit('chat:join', { chatId });
      });
    });

    // Escuchar mensajes de todos los chats
    newSocket.on('message:new', (message: Message) => {
      setChats(prev => {
        const chatState = prev[message.chatId];
        if (!chatState) return prev;

        const isActiveChat = message.chatId === activeChat;
        
        return {
          ...prev,
          [message.chatId]: {
            ...chatState,
            messages: [...chatState.messages, message],
            unreadCount: isActiveChat ? 0 : chatState.unreadCount + 1,
          },
        };
      });
    });

    setSocket(newSocket);

    return () => {
      chatIds.forEach(chatId => {
        newSocket.emit('chat:leave', { chatId });
      });
      newSocket.disconnect();
    };
  }, [chatIds, token, activeChat]);

  // Marcar chat como leído cuando se activa
  const markChatAsRead = useCallback((chatId: string) => {
    setActiveChat(chatId);
    setChats(prev => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        unreadCount: 0,
      },
    }));
  }, []);

  // Enviar mensaje a un chat específico
  const sendMessageToChat = useCallback(async (
    chatId: string,
    content: string
  ) => {
    try {
      const response = await fetch('http://localhost:3000/v2/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({ chatId, content, type: 'text' }),
      });

      if (!response.ok) {
        throw new Error('Error al enviar mensaje');
      }

      return await response.json();
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }, [token]);

  return {
    socket,
    chats,
    activeChat,
    markChatAsRead,
    sendMessageToChat,
  };
}
```

### Componente de Lista de Chats con Badges

```typescript
// components/ChatList.tsx
import React from 'react';

interface ChatListProps {
  chats: Record<string, { unreadCount: number; messages: any[] }>;
  activeChat: string | null;
  onSelectChat: (chatId: string) => void;
}

export function ChatList({ chats, activeChat, onSelectChat }: ChatListProps) {
  return (
    <div className="chat-list">
      <h3>Chats Activos</h3>
      {Object.entries(chats).map(([chatId, chatState]) => {
        const lastMessage = chatState.messages[chatState.messages.length - 1];
        
        return (
          <div
            key={chatId}
            className={`chat-item ${activeChat === chatId ? 'active' : ''}`}
            onClick={() => onSelectChat(chatId)}
          >
            <div className="chat-item-header">
              <span className="chat-id">Chat {chatId.slice(0, 8)}</span>
              {chatState.unreadCount > 0 && (
                <span className="unread-badge">{chatState.unreadCount}</span>
              )}
            </div>
            
            {lastMessage && (
              <div className="chat-preview">
                {lastMessage.content.slice(0, 50)}...
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

---

## Indicador de "Escribiendo..." (Typing Indicator)

### Implementación Básica

```typescript
// hooks/useTypingIndicator.ts
import { useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

export function useTypingIndicator(socket: Socket | null, chatId: string) {
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);

  // Escuchar eventos de "escribiendo"
  useEffect(() => {
    if (!socket) return;

    socket.on('user:typing', (data: { userId: string; chatId: string }) => {
      if (data.chatId === chatId) {
        setTypingUsers(prev => {
          if (!prev.includes(data.userId)) {
            return [...prev, data.userId];
          }
          return prev;
        });

        // Remover usuario después de 3 segundos
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(id => id !== data.userId));
        }, 3000);
      }
    });

    socket.on('user:stop-typing', (data: { userId: string; chatId: string }) => {
      if (data.chatId === chatId) {
        setTypingUsers(prev => prev.filter(id => id !== data.userId));
      }
    });

    return () => {
      socket.off('user:typing');
      socket.off('user:stop-typing');
    };
  }, [socket, chatId]);

  // Notificar que estoy escribiendo
  const notifyTyping = useCallback(() => {
    if (!socket) return;

    if (!isTyping) {
      socket.emit('typing:start', { chatId });
      setIsTyping(true);
    }

    // Limpiar timeout anterior
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Detener después de 3 segundos de inactividad
    const timeout = setTimeout(() => {
      socket.emit('typing:stop', { chatId });
      setIsTyping(false);
    }, 3000);

    setTypingTimeout(timeout);
  }, [socket, chatId, isTyping, typingTimeout]);

  const stopTyping = useCallback(() => {
    if (socket && isTyping) {
      socket.emit('typing:stop', { chatId });
      setIsTyping(false);
      
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        setTypingTimeout(null);
      }
    }
  }, [socket, chatId, isTyping, typingTimeout]);

  return {
    isTyping,
    typingUsers,
    notifyTyping,
    stopTyping,
  };
}
```

### Uso en Componente

```typescript
// Dentro del componente de chat
const { typingUsers, notifyTyping, stopTyping } = useTypingIndicator(socket, chatId);

const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
  setInputMessage(e.target.value);
  notifyTyping(); // Notificar que estoy escribiendo
};

const handleSend = async () => {
  stopTyping(); // Detener indicador antes de enviar
  await sendMessage(inputMessage);
  setInputMessage('');
};

// Mostrar indicador
{typingUsers.length > 0 && (
  <div className="typing-indicator">
    {typingUsers.length === 1
      ? 'Alguien está escribiendo...'
      : `${typingUsers.length} personas están escribiendo...`}
  </div>
)}
```

---

## Manejo de Archivos Adjuntos en Tiempo Real

### Upload y Notificación de Archivos

```typescript
// hooks/useFileUpload.ts
import { useState } from 'react';

export function useFileUpload(chatId: string, token?: string) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 1. Subir archivo a servidor/storage
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chatId', chatId);

      const uploadResponse = await fetch('http://localhost:3000/v2/files/upload', {
        method: 'POST',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Error al subir archivo');
      }

      const fileData = await uploadResponse.json();

      // 2. Enviar mensaje con attachment
      const messageResponse = await fetch('http://localhost:3000/v2/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          chatId,
          content: `Archivo: ${file.name}`,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          attachment: {
            url: fileData.url,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          },
        }),
      });

      if (!messageResponse.ok) {
        throw new Error('Error al enviar mensaje con archivo');
      }

      setUploadProgress(100);
      return await messageResponse.json();
    } catch (error) {
      console.error('Error al subir archivo:', error);
      throw error;
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  return {
    uploadFile,
    isUploading,
    uploadProgress,
  };
}
```

### Componente de Adjuntos

```typescript
// components/FileAttachment.tsx
import React from 'react';

interface FileAttachmentProps {
  attachment: {
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
}

export function FileAttachment({ attachment }: FileAttachmentProps) {
  const isImage = attachment.mimeType.startsWith('image/');
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  if (isImage) {
    return (
      <div className="attachment-image">
        <img 
          src={attachment.url} 
          alt={attachment.fileName}
          loading="lazy"
          style={{ maxWidth: '300px', maxHeight: '300px' }}
        />
        <div className="attachment-info">
          <span>{attachment.fileName}</span>
          <span>{formatFileSize(attachment.fileSize)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="attachment-file">
      <a 
        href={attachment.url} 
        target="_blank" 
        rel="noopener noreferrer"
        download={attachment.fileName}
      >
        <div className="file-icon">📎</div>
        <div className="file-details">
          <div className="file-name">{attachment.fileName}</div>
          <div className="file-size">{formatFileSize(attachment.fileSize)}</div>
        </div>
      </a>
    </div>
  );
}
```

---

## Testing Avanzado con Socket.IO

### Mockear Socket.IO en Jest

```typescript
// __mocks__/socket.io-client.ts
export const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  connected: true,
};

export const io = jest.fn(() => mockSocket);
```

### Test Unitario de Hook

```typescript
// hooks/__tests__/useRealtimeChat.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { io } from 'socket.io-client';
import { useRealtimeChat } from '../useRealtimeChat';

// Mock Socket.IO
jest.mock('socket.io-client');

describe('useRealtimeChat', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (io as jest.Mock).mockReturnValue(mockSocket);
  });

  it('debe conectarse y unirse al chat', () => {
    const chatId = 'test-chat-id';
    renderHook(() => useRealtimeChat(chatId));

    expect(io).toHaveBeenCalledWith('http://localhost:3000', expect.any(Object));
    
    // Simular conexión
    const connectCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'connect'
    )?.[1];
    
    act(() => {
      connectCallback?.();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { chatId });
  });

  it('debe agregar mensajes cuando llega message:new', async () => {
    const chatId = 'test-chat-id';
    const { result } = renderHook(() => useRealtimeChat(chatId));

    // Obtener callback de message:new
    const messageCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'message:new'
    )?.[1];

    const newMessage = {
      messageId: 'msg-1',
      chatId,
      content: 'Hola',
      senderId: 'user-1',
      sentAt: new Date().toISOString(),
    };

    act(() => {
      messageCallback?.(newMessage);
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]).toEqual(newMessage);
    });
  });

  it('debe limpiar listeners al desmontar', () => {
    const { unmount } = renderHook(() => useRealtimeChat('test-chat-id'));

    unmount();

    expect(mockSocket.emit).toHaveBeenCalledWith('chat:leave', { 
      chatId: 'test-chat-id' 
    });
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
```

### Test de Integración con Mock Server

```typescript
// __tests__/integration/chat-integration.test.ts
import { Server } from 'socket.io';
import { io as ClientIO, Socket } from 'socket.io-client';
import { createServer } from 'http';

describe('Chat Integration Tests', () => {
  let serverSocket: Server;
  let clientSocket: Socket;
  let httpServer: any;

  beforeAll((done) => {
    httpServer = createServer();
    serverSocket = new Server(httpServer, {
      cors: { origin: '*' },
    });

    httpServer.listen(() => {
      const port = httpServer.address().port;
      clientSocket = ClientIO(`http://localhost:${port}`);
      
      serverSocket.on('connection', (socket) => {
        socket.on('chat:join', ({ chatId }) => {
          socket.join(`chat:${chatId}`);
          socket.emit('joined', { chatId });
        });

        socket.on('chat:leave', ({ chatId }) => {
          socket.leave(`chat:${chatId}`);
        });
      });

      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    clientSocket.disconnect();
    serverSocket.close();
    httpServer.close();
  });

  it('debe recibir mensajes del servidor', (done) => {
    const chatId = 'test-integration-chat';
    
    clientSocket.emit('chat:join', { chatId });

    clientSocket.on('message:new', (message) => {
      expect(message.content).toBe('Test message');
      done();
    });

    // Simular envío desde servidor
    setTimeout(() => {
      serverSocket.to(`chat:${chatId}`).emit('message:new', {
        messageId: 'msg-1',
        chatId,
        content: 'Test message',
        senderId: 'server',
        sentAt: new Date().toISOString(),
      });
    }, 100);
  });
});
```

---

## Estilos CSS Completos para Chat

### CSS Production-Ready

```css
/* styles/chat-room.css */

/* Contenedor principal */
.chat-room {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

/* Header */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background-color: #075e54;
  color: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.chat-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  padding: 4px 12px;
  border-radius: 12px;
  background-color: rgba(255, 255, 255, 0.2);
}

.connection-status.connected {
  background-color: rgba(76, 175, 80, 0.3);
}

.connection-status.disconnected {
  background-color: rgba(244, 67, 54, 0.3);
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.connection-dot.connected {
  background-color: #4caf50;
  animation: pulse 2s infinite;
}

.connection-dot.disconnected {
  background-color: #f44336;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Lista de mensajes */
.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-behavior: smooth;
}

.messages-list::-webkit-scrollbar {
  width: 6px;
}

.messages-list::-webkit-scrollbar-track {
  background: transparent;
}

.messages-list::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

/* Mensajes */
.message {
  display: flex;
  max-width: 70%;
  animation: messageSlideIn 0.2s ease-out;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-own {
  align-self: flex-end;
  justify-content: flex-end;
}

.message-other {
  align-self: flex-start;
  justify-content: flex-start;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 8px;
  word-wrap: break-word;
  position: relative;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.message-own .message-bubble {
  background-color: #dcf8c6;
  border-bottom-right-radius: 2px;
}

.message-other .message-bubble {
  background-color: white;
  border-bottom-left-radius: 2px;
}

.message-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
}

.message-time {
  display: block;
  font-size: 11px;
  color: #999;
  margin-top: 4px;
  text-align: right;
}

/* Estados */
.message-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #999;
  margin-left: 6px;
}

.message-status.sending {
  color: #999;
}

.message-status.sent {
  color: #4caf50;
}

.message-status.failed {
  color: #f44336;
  cursor: pointer;
}

.message-status.failed:hover {
  text-decoration: underline;
}

/* Typing indicator */
.typing-indicator {
  padding: 8px 16px;
  background-color: rgba(0, 0, 0, 0.05);
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  font-size: 13px;
  color: #666;
  font-style: italic;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Input */
.message-input-container {
  display: flex;
  gap: 8px;
  padding: 16px;
  background-color: white;
  border-top: 1px solid #ddd;
}

.message-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 24px;
  font-size: 14px;
  outline: none;
  resize: none;
  max-height: 120px;
  font-family: inherit;
}

.message-input:focus {
  border-color: #075e54;
}

.send-button {
  padding: 12px 24px;
  background-color: #075e54;
  color: white;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background-color 0.2s;
}

.send-button:hover:not(:disabled) {
  background-color: #064e47;
}

.send-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

/* Adjuntos */
.attachment-image {
  margin-top: 8px;
}

.attachment-image img {
  border-radius: 8px;
  display: block;
}

.attachment-info {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #666;
  margin-top: 4px;
}

.attachment-file {
  margin-top: 8px;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 8px 12px;
}

.attachment-file a {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
}

.file-icon {
  font-size: 24px;
}

.file-details {
  flex: 1;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.file-size {
  font-size: 11px;
  color: #999;
}

/* Lista de chats */
.chat-list {
  width: 300px;
  background-color: white;
  border-right: 1px solid #ddd;
  overflow-y: auto;
}

.chat-list h3 {
  padding: 16px;
  margin: 0;
  background-color: #075e54;
  color: white;
  font-size: 16px;
}

.chat-item {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.chat-item:hover {
  background-color: #f5f5f5;
}

.chat-item.active {
  background-color: #e8f5e9;
}

.chat-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.chat-id {
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.unread-badge {
  background-color: #25d366;
  color: white;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.chat-preview {
  font-size: 13px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Responsive */
@media (max-width: 768px) {
  .chat-room {
    max-width: 100%;
    border-radius: 0;
  }

  .message {
    max-width: 85%;
  }

  .chat-list {
    width: 100%;
  }
}
```

---

## Optimización de Performance

### Virtualización de Mensajes

Para chats con miles de mensajes, usa `react-window`:

```typescript
// npm install react-window

import { FixedSizeList } from 'react-window';

interface VirtualizedMessagesProps {
  messages: Message[];
  height: number;
}

export function VirtualizedMessages({ messages, height }: VirtualizedMessagesProps) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const message = messages[index];
    
    return (
      <div style={style}>
        <ChatMessage message={message} />
      </div>
    );
  };

  return (
    <FixedSizeList
      height={height}
      itemCount={messages.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

### Debounce para Typing Indicator

```typescript
import { debounce } from 'lodash';

const debouncedStopTyping = debounce(() => {
  socket?.emit('typing:stop', { chatId });
}, 2000);

const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
  setInputMessage(e.target.value);
  socket?.emit('typing:start', { chatId });
  debouncedStopTyping();
};
```

### Lazy Loading de Imágenes

```typescript
// components/LazyImage.tsx
import React, { useState, useEffect, useRef } from 'react';

export function LazyImage({ src, alt }: { src: string; alt: string }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setImageSrc(src);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  return (
    <img
      ref={imgRef}
      src={imageSrc || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E'}
      alt={alt}
      loading="lazy"
    />
  );
}
```

### Memoización de Componentes

```typescript
import React, { memo } from 'react';

export const ChatMessage = memo(
  ({ message }: { message: Message }) => {
    return (
      <div className={`message ${message.isOwn ? 'message-own' : 'message-other'}`}>
        <div className="message-bubble">
          <p className="message-content">{message.content}</p>
          <span className="message-time">
            {new Date(message.sentAt).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.message.messageId === nextProps.message.messageId &&
           prevProps.message.content === nextProps.message.content;
  }
);
```

---

## Testing con Socket.IO Client

```javascript
// test-websocket.js
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  path: '/socket.io/',
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅ Conectado:', socket.id);
  
  // Unirse a sala de chat
  socket.emit('chat:join', { chatId: 'test-chat-123' });
});

socket.on('chat:joined', (data) => {
  console.log('✅ Unido a sala:', data);
});

socket.on('message:new', (message) => {
  console.log('📨 Mensaje recibido:', message);
});

// Ejecutar: node test-websocket.js
```

---

## Eventos Disponibles

### Eventos del Cliente → Servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `visitor:join` | `{ visitorId: string }` | Unirse a sala de visitante (notificaciones proactivas) |
| `visitor:leave` | `{ visitorId: string }` | Salir de sala de visitante |
| `chat:join` | `{ chatId: string }` | Unirse a una sala de chat |
| `chat:leave` | `{ chatId: string }` | Salir de una sala de chat |
| `health-check` | - | Verificar estado del servidor |
| `test` | `{ message: string }` | Test de conectividad |

### Eventos del Servidor → Cliente

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `welcome` | `{ message, clientId, timestamp }` | Mensaje de bienvenida al conectar |
| `visitor:joined` | `{ visitorId, roomName, timestamp }` | Confirmación de unión a sala de visitante |
| `visitor:left` | `{ visitorId, roomName, timestamp }` | Confirmación de salida de sala de visitante |
| `chat:created` | `{ chatId, visitorId, status, priority, ... }` | Notificación de chat creado por comercial |
| `chat:joined` | `{ chatId, roomName, timestamp }` | Confirmación de unión a sala de chat |
| `chat:left` | `{ chatId, roomName, timestamp }` | Confirmación de salida de sala de chat |
| `message:new` | `{ messageId, chatId, content, ... }` | Nuevo mensaje en el chat |
| `chat:status` | `{ chatId, status, timestamp }` | Cambio de estado del chat |

---

## Consideraciones de Producción

### 1. Configuración CORS

```typescript
// En producción, especificar orígenes permitidos
@WebSocketGateway({
  cors: {
    origin: ['https://tuapp.com', 'https://admin.tuapp.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // ...
})
```

### 2. Límites de Reconexión

```javascript
const socket = io('https://api.tuapp.com', {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});
```

### 3. Autenticación Robusta

- Validar JWT tokens en cada conexión
- Renovar tokens antes de expiración
- Desconectar clientes con tokens inválidos

### 4. Monitoreo

- Trackear conexiones activas
- Monitorear latencia de mensajes
- Logs de eventos críticos

---

## Troubleshooting

### Problema: No recibo mensajes

**Solución:**
1. Verificar que te uniste a la sala: `socket.emit('chat:join', { chatId })`
2. Confirmar que el listener está registrado: `socket.on('message:new', ...)`
3. Revisar logs del servidor para eventos emitidos

### Problema: Desconexión frecuente

**Solución:**
1. Verificar configuración de red/firewall
2. Usar `transports: ['websocket', 'polling']` para fallback
3. Implementar heartbeat manual si es necesario

### Problema: Mensajes duplicados

**Solución:**
1. No registrar múltiples listeners para el mismo evento
2. Limpiar listeners al desmontar componentes
3. Usar `socket.off('event')` antes de re-registrar

---

## Mejores Prácticas y Patrones de Diseño

### 1. Gestión de Estado del Socket

**✅ Hacer:**
```typescript
// Almacenar socket en contexto para compartir entre componentes
const SocketContext = React.createContext<Socket | null>(null);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      auth: { token: getAuthToken() },
      withCredentials: true,
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
```

**❌ Evitar:**
```typescript
// No crear múltiples conexiones socket
function ChatComponent() {
  const socket = io('http://localhost:3000'); // ❌ Se crea nueva conexión cada render
  // ...
}
```

### 2. Manejo de Eventos

**✅ Hacer:**
```typescript
// Siempre limpiar listeners
useEffect(() => {
  if (!socket) return;

  const handleMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };

  socket.on('message:new', handleMessage);

  return () => {
    socket.off('message:new', handleMessage);
  };
}, [socket]);
```

**❌ Evitar:**
```typescript
// No acumular listeners
useEffect(() => {
  socket?.on('message:new', handleMessage); // ❌ Sin cleanup, se acumulan listeners
}, []);
```

### 3. Estados de Conexión

**✅ Implementar indicadores visuales:**
```typescript
const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

useEffect(() => {
  if (!socket) return;

  socket.on('connect', () => setConnectionState('connected'));
  socket.on('disconnect', () => setConnectionState('disconnected'));
  socket.on('connect_error', () => setConnectionState('disconnected'));

  return () => {
    socket.off('connect');
    socket.off('disconnect');
    socket.off('connect_error');
  };
}, [socket]);
```

### 4. Rate Limiting y Throttling

**Para evitar flood de eventos:**
```typescript
import { throttle } from 'lodash';

// Throttle typing notifications
const throttledTyping = throttle(() => {
  socket?.emit('typing:start', { chatId });
}, 1000, { leading: true, trailing: false });

const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setMessage(e.target.value);
  throttledTyping();
};
```

### 5. Seguridad

**✅ Validar datos del servidor:**
```typescript
socket.on('message:new', (data: unknown) => {
  // Validar estructura antes de usar
  if (isValidMessage(data)) {
    setMessages(prev => [...prev, data]);
  } else {
    console.error('Mensaje inválido recibido:', data);
  }
});

function isValidMessage(data: any): data is Message {
  return (
    typeof data === 'object' &&
    typeof data.messageId === 'string' &&
    typeof data.content === 'string' &&
    typeof data.chatId === 'string'
  );
}
```

**✅ Sanitizar contenido:**
```typescript
import DOMPurify from 'dompurify';

function ChatMessage({ message }: { message: Message }) {
  const sanitizedContent = DOMPurify.sanitize(message.content);
  
  return (
    <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
  );
}
```

### 6. Manejo de Errores Robusto

```typescript
const sendMessageWithRetry = async (content: string, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('http://localhost:3000/v2/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, content, type: 'text' }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Intento ${attempt} falló:`, error);
      
      if (attempt === maxRetries) {
        throw new Error('No se pudo enviar el mensaje después de varios intentos');
      }
      
      // Backoff exponencial
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
};
```

### 7. Arquitectura de Componentes

**Separar concerns:**
```
components/
├── chat/
│   ├── ChatRoom.tsx           # Componente principal (orquestador)
│   ├── MessageList.tsx        # Lista de mensajes
│   ├── MessageInput.tsx       # Input para enviar mensajes
│   ├── Message.tsx            # Mensaje individual
│   ├── ConnectionStatus.tsx   # Indicador de conexión
│   └── TypingIndicator.tsx    # Indicador "escribiendo..."
├── hooks/
│   ├── useSocket.ts           # Hook para manejar socket
│   ├── useRealtimeChat.ts     # Hook para chat específico
│   └── useTypingIndicator.ts  # Hook para typing
└── utils/
    ├── socketClient.ts        # Cliente socket singleton
    └── messageValidator.ts    # Validaciones
```

### 8. Testing

**Estructura de tests:**
```typescript
describe('ChatRoom', () => {
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    
    (io as jest.Mock).mockReturnValue(mockSocket);
  });

  it('debe unirse al chat al montar', () => {
    render(<ChatRoom chatId="test-123" />);
    
    expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { 
      chatId: 'test-123' 
    });
  });

  it('debe mostrar mensaje nuevo cuando llega del socket', async () => {
    const { getByText } = render(<ChatRoom chatId="test-123" />);
    
    // Simular llegada de mensaje
    const messageHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'message:new'
    )[1];
    
    act(() => {
      messageHandler({ 
        messageId: '1', 
        content: 'Hola', 
        senderId: 'user-1' 
      });
    });

    await waitFor(() => {
      expect(getByText('Hola')).toBeInTheDocument();
    });
  });
});
```

### 9. Monitoreo y Observabilidad

```typescript
// Trackear métricas
const logSocketEvent = (eventType: string, data?: any) => {
  // Enviar a servicio de analytics
  analytics.track('socket_event', {
    type: eventType,
    timestamp: Date.now(),
    data,
  });
};

socket.on('connect', () => {
  logSocketEvent('connect', { socketId: socket.id });
});

socket.on('message:new', (message) => {
  logSocketEvent('message_received', { 
    messageId: message.messageId,
    chatId: message.chatId,
  });
});
```

### 10. Documentación de Contratos

**Mantener documentado el contrato de eventos:**
```typescript
/**
 * Eventos del Chat en Tiempo Real
 *
 * Cliente → Servidor:
 * - visitor:join { visitorId: string }
 * - visitor:leave { visitorId: string }
 * - chat:join { chatId: string }
 * - chat:leave { chatId: string }
 * - typing:start { chatId: string }
 * - typing:stop { chatId: string }
 *
 * Servidor → Cliente:
 * - visitor:joined { visitorId, roomName, timestamp }
 * - visitor:left { visitorId, roomName, timestamp }
 * - chat:created { chatId, visitorId, status, priority, visitorInfo, metadata, createdAt, message }
 * - message:new { messageId, chatId, content, senderId, sentAt, ... }
 * - chat:status { chatId, status, timestamp }
 * - user:typing { userId, chatId }
 * - user:stop-typing { userId, chatId }
 */
```

---

## Checklist de Implementación

### Básico (MVP)
- [ ] Conexión Socket.IO con autenticación
- [ ] Join/Leave de salas de chat
- [ ] Recibir mensajes en tiempo real
- [ ] Indicador de estado de conexión
- [ ] Cleanup de listeners en unmount

### Intermedio
- [ ] Optimistic updates en envío de mensajes
- [ ] Indicador de "escribiendo..."
- [ ] Manejo de reconexión con sincronización
- [ ] Carga de historial de mensajes
- [ ] Estados de mensaje (enviando/enviado/fallido)

### Avanzado
- [ ] Gestión de múltiples chats simultáneos
- [ ] Adjuntos de archivos/imágenes
- [ ] Virtualización para listas largas
- [ ] Notificaciones del navegador
- [ ] Tests unitarios e integración
- [ ] Monitoreo y analytics

### Producción
- [ ] Rate limiting y throttling
- [ ] Validación y sanitización de datos
- [ ] Manejo robusto de errores con retry
- [ ] CORS y seguridad configurados
- [ ] Documentación completa de contratos
- [ ] CSS responsive y accesible

---

## Próximos Pasos

1. ✅ Implementar autenticación real en `authenticateClient()`
2. ✅ Agregar métricas de conexiones activas
3. ✅ Implementar rate limiting para eventos
4. ✅ Tests de integración end-to-end
5. ✅ Documentación de eventos adicionales

---

## Referencias

- [Socket.IO Client Documentation](https://socket.io/docs/v4/client-api/)
- [NestJS WebSocket Documentation](https://docs.nestjs.com/websockets/gateways)
- Código fuente: `src/websocket/websocket.gateway.ts`
- Event handler: `src/context/conversations-v2/application/events/notify-message-sent-on-message-sent.event-handler.ts`
