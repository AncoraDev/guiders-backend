# Fix: Pérdida de ChatCreatedEvent al Asignar Comercial

## Resumen del Bug

Cuando un comercial crea un chat proactivamente para un visitante, el evento `ChatCreatedEvent` se perdía durante el proceso de asignación, lo que impedía que se enviara la notificación WebSocket `chat:created` al visitante.

### Fecha del Fix
2025-10-13

### Impacto
- **Severidad**: Alta
- **Afectados**: Todos los chats creados con `commercialId` especificado
- **Síntoma**: El visitante no recibe la notificación WebSocket cuando un comercial crea un chat para él

## Análisis del Problema

### Flujo del Bug

1. **Creación del Chat** (`CreateChatWithMessageCommandHandler`)
   ```typescript
   // Línea 50-67: Se crea el chat pendiente
   let chat = Chat.createPendingChat({
     visitorId: command.visitorId,
     visitorInfo: command.visitorInfo || {},
     availableCommercialIds: [],
     priority: defaultPriority,
     metadata: command.metadata,
   });
   // ✅ En este punto, chat tiene ChatCreatedEvent en sus eventos no comprometidos
   ```

2. **Asignación de Comercial**
   ```typescript
   // Línea 69-73: Si viene un commercialId, asignar el chat
   if (command.commercialId) {
     chat = chat.assignCommercial(command.commercialId);
   }
   // ❌ AQUÍ ESTABA EL BUG: assignCommercial() devuelve un nuevo Chat
   // que solo contiene CommercialAssignedEvent, perdiendo ChatCreatedEvent
   ```

3. **Publicación de Eventos**
   ```typescript
   // Línea 76: Se prepara el contexto con el chat actualizado
   const chatAggregate = this.publisher.mergeObjectContext(chat);

   // Línea 142: Se confirman los eventos
   chatAggregate.commit();
   // ❌ Solo se publica CommercialAssignedEvent, no ChatCreatedEvent
   ```

### Causa Raíz

El método `assignCommercial()` en `Chat.aggregate.ts` seguía el patrón de inmutabilidad de DDD, creando un nuevo objeto `Chat` con el estado actualizado. Sin embargo, **no copiaba los eventos no comprometidos del chat original**, lo que resultaba en:

```typescript
// ANTES DEL FIX
public assignCommercial(commercialId: string): Chat {
  // ... validaciones ...

  const updatedChat = new Chat(/* nuevos valores */);

  // ❌ Solo se agregaba el nuevo evento
  updatedChat.apply(new CommercialAssignedEvent({...}));

  return updatedChat; // ❌ Sin ChatCreatedEvent
}
```

## La Solución

### Modificación Aplicada

**Archivo**: `src/context/conversations-v2/domain/entities/chat.aggregate.ts`
**Líneas**: 241-259

```typescript
public assignCommercial(commercialId: string): Chat {
  if (!this._status.canBeAssigned()) {
    throw new Error('El chat no puede ser asignado en su estado actual');
  }

  const commercial = CommercialId.create(commercialId);
  const now = new Date();

  const updatedChat = new Chat(
    this._id,
    ChatStatus.ASSIGNED,
    this._priority,
    this._visitorId,
    commercial,
    this._availableCommercialIds,
    this._lastMessageDate,
    this._lastMessageContent,
    this._lastMessageSenderId,
    this._totalMessages,
    this._firstResponseTime,
    this._responseTimeSeconds,
    this._closedAt,
    this._closedReason,
    this._visitorInfo,
    this._metadata,
    this._createdAt,
    now,
  );

  // ✅ FIX: Copiar eventos no comprometidos del chat original
  // Esto asegura que ChatCreatedEvent no se pierda
  const originalEvents = this.getUncommittedEvents();
  originalEvents.forEach((event) => updatedChat.apply(event));

  // Agregar el nuevo evento de asignación
  updatedChat.apply(
    new CommercialAssignedEvent({
      assignment: {
        chatId: this._id.getValue(),
        commercialId: commercialId,
        visitorId: this._visitorId.getValue(),
        previousStatus: this._status.value,
        newStatus: ChatStatus.ASSIGNED.value,
        assignedAt: now,
        assignmentReason: 'auto',
      },
    }),
  );

  return updatedChat;
}
```

### ¿Por Qué Funciona?

1. **Preservación de Eventos**: Al copiar `originalEvents` antes de agregar el nuevo evento, se mantiene la cadena completa de eventos del aggregate
2. **Orden Correcto**: Los eventos se aplican en orden: primero `ChatCreatedEvent`, luego `CommercialAssignedEvent`
3. **Inmutabilidad Mantenida**: Se sigue el patrón DDD de objetos inmutables, pero ahora correctamente
4. **Ambos Eventos Publicados**: Cuando se llama `commit()`, ambos eventos se publican a través del EventBus

## Verificación del Fix

### 1. Test Unitario Agregado

**Archivo**: `src/context/conversations-v2/domain/entities/__tests__/chat.spec.ts`
**Líneas**: 75-106

```typescript
it('debería preservar ChatCreatedEvent al asignar comercial', () => {
  // Arrange
  const chat = Chat.createPendingChat({
    visitorId: mockVisitorId,
    visitorInfo: mockVisitorInfo,
    availableCommercialIds: [mockCommercialId],
  });

  // Verificar que el chat original tiene ChatCreatedEvent
  const originalEvents = chat.getUncommittedEvents();
  expect(originalEvents).toHaveLength(1);
  expect(originalEvents[0].constructor.name).toBe('ChatCreatedEvent');

  // Act
  const assignedChat = chat.assignCommercial(mockCommercialId);

  // Assert: El chat asignado debe tener AMBOS eventos
  const assignedEvents = assignedChat.getUncommittedEvents();
  expect(assignedEvents).toHaveLength(2);

  // Verificar que ChatCreatedEvent se preservó
  const chatCreatedEvent = assignedEvents.find(
    (e) => e.constructor.name === 'ChatCreatedEvent',
  );
  expect(chatCreatedEvent).toBeDefined();

  // Verificar que CommercialAssignedEvent se agregó
  const commercialAssignedEvent = assignedEvents.find(
    (e) => e.constructor.name === 'CommercialAssignedEvent',
  );
  expect(commercialAssignedEvent).toBeDefined();
});
```

**Resultado**: ✅ Test pasa correctamente

### 2. Logs Esperados Después del Fix

Cuando un comercial crea un chat, ahora deberías ver estos logs:

```
[CreateChatWithMessageCommandHandler] Chat creado: chat-uuid-here
[CreateChatWithMessageCommandHandler] Comercial asignado: commercial-uuid-here

=== INICIO NotifyChatCreatedOnChatCreatedEventHandler ===
Procesando notificación de chat creado: chat-uuid-here
📍 Datos del evento: chatId=chat-uuid-here, visitorId=visitor-uuid-here, status=PENDING
🔔 Notificando al visitante visitor-uuid-here de nuevo chat: chat-uuid-here
📡 Emitiendo a la sala: visitor:visitor-uuid-here
📦 Payload: {"chatId":"...","visitorId":"...","status":"PENDING",...}
✅ Notificación de chat creado enviada exitosamente al visitante visitor-uuid-here
=== FIN NotifyChatCreatedOnChatCreatedEventHandler ===

[NotifyCommercialAssignedOnCommercialAssignedEventHandler] Comercial asignado notificado
```

### 3. Verificación en Frontend

Cuando el visitante está conectado al WebSocket:

```javascript
socket.on('chat:created', (data) => {
  console.log('🎉 Nuevo chat creado:', data);
  // data = {
  //   chatId: 'chat-uuid-here',
  //   visitorId: 'visitor-uuid-here',
  //   status: 'PENDING',
  //   priority: 'NORMAL',
  //   visitorInfo: { name: '...', email: '...' },
  //   metadata: { ... },
  //   createdAt: '2025-10-13T10:00:00.000Z',
  //   message: 'Un comercial ha iniciado una conversación contigo'
  // }
});
```

## Testing

### Ejecutar Tests Unitarios

```bash
npm run test:unit -- src/context/conversations-v2/domain/entities/__tests__/chat.spec.ts
```

**Resultado esperado**:
```
PASS  src/context/conversations-v2/domain/entities/__tests__/chat.spec.ts
  Chat
    assignCommercial
      ✓ debería asignar comercial a chat pendiente
      ✓ debería preservar ChatCreatedEvent al asignar comercial  👈 NUEVO
      ✓ debería lanzar error si se intenta asignar chat ya cerrado

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

### Testing Manual con Script

```bash
# 1. Asegúrate de que el servidor esté corriendo
npm run start:dev

# 2. En otra terminal, ejecuta el script de prueba
node scripts/test-chat-created-notification.js
```

**Resultado esperado**: El script debe mostrar que recibió la notificación `chat:created`.

## Impacto en Otros Métodos

Este patrón también se aplica a otros métodos que crean nuevos agregados inmutables:

### ✅ Método `close()`

El método `close()` **NO** necesita copiar eventos porque:
- Se llama después de que el chat ya fue guardado y los eventos anteriores ya fueron comprometidos
- Es una operación independiente que no forma parte del mismo flujo transaccional

### ⚠️ Patrón General para el Futuro

Si se agregan más métodos que modifican el estado del chat, deben seguir este patrón:

```typescript
public someModifyingMethod(): Chat {
  const updatedChat = new Chat(/* nuevo estado */);

  // ✅ IMPORTANTE: Copiar eventos no comprometidos
  const originalEvents = this.getUncommittedEvents();
  originalEvents.forEach((event) => updatedChat.apply(event));

  // Agregar nuevo evento específico del método
  updatedChat.apply(new SomeNewEvent({...}));

  return updatedChat;
}
```

## Lecciones Aprendidas

1. **Inmutabilidad + Eventos**: Al usar el patrón de agregados inmutables con Event Sourcing, SIEMPRE copiar los eventos no comprometidos cuando se crea un nuevo aggregate

2. **Tests de Eventos**: Los tests deben verificar no solo el estado del aggregate, sino también los eventos que emite

3. **Debugging de Eventos**: Cuando un event handler no se ejecuta, verificar:
   - ¿El evento se está aplicando al aggregate? (`aggregate.apply(event)`)
   - ¿El evento se está comprometiendo? (`aggregate.commit()`)
   - ¿Se está usando el aggregate correcto después de modificaciones?

4. **Logs Estratégicos**: Los logs al inicio y fin del event handler ayudan a detectar si el handler nunca se ejecuta vs. si falla durante la ejecución

## Referencias

- **Event Handler**: `src/context/conversations-v2/application/events/notify-chat-created-on-chat-created.event-handler.ts`
- **Command Handler**: `src/context/conversations-v2/application/commands/create-chat-with-message.command-handler.ts`
- **Aggregate Fixed**: `src/context/conversations-v2/domain/entities/chat.aggregate.ts` (líneas 241-259)
- **Test Coverage**: `src/context/conversations-v2/domain/entities/__tests__/chat.spec.ts` (líneas 75-106)
- **WebSocket Docs**: `./websocket-real-time-chat.md`

## Pasos para Aplicar en Producción

1. ✅ **Fix aplicado**: Modificación en `chat.aggregate.ts`
2. ✅ **Tests agregados**: Test unitario que verifica la preservación de eventos
3. ✅ **Tests pasando**: Todos los tests unitarios pasan
4. 🔄 **Pendiente**: User debe reiniciar servidor y probar en frontend
5. 🔄 **Pendiente**: Verificar logs del servidor durante el test
6. 🔄 **Pendiente**: Confirmar que visitante recibe notificación en frontend

## Siguiente Paso para el Usuario

**Por favor, realiza estos pasos para verificar el fix:**

1. **Reinicia el servidor**:
   ```bash
   npm run start:dev
   ```

2. **Prueba desde el frontend SDK de visitantes**:
   - Conecta un visitante al WebSocket
   - Une el visitante a su sala con `socket.emit('visitor:join', { visitorId })`
   - Desde un comercial, crea un chat para ese visitante
   - Verifica que el visitante recibe `chat:created`

3. **Revisa los logs del servidor** - Deberías ver:
   ```
   === INICIO NotifyChatCreatedOnChatCreatedEventHandler ===
   Procesando notificación de chat creado: ...
   ✅ Notificación de chat creado enviada exitosamente al visitante ...
   === FIN NotifyChatCreatedOnChatCreatedEventHandler ===
   ```

4. **Reporta el resultado**:
   - ✅ Si funciona: Confirma que recibiste la notificación
   - ❌ Si no funciona: Comparte los logs del servidor y del frontend
