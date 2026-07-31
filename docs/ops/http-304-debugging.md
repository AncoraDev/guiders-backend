# Debugging HTTP 304 Responses

## ¿Qué es el status 304?
HTTP 304 "Not Modified" es una respuesta **normal y eficiente** que indica que el contenido no ha cambiado desde la última petición del cliente.

## Casos donde es normal ver 304:
1. **Recargar página**: El navegador reutiliza contenido cached
2. **Peticiones repetidas**: Mismo endpoint llamado múltiples veces
3. **Navegador optimizando**: Headers condicionales automáticos

## Casos donde puede ser problemático:
1. **Datos que deberían cambiar**: Si esperas datos nuevos pero recibes 304
2. **APIs en tiempo real**: Donde los datos cambian frecuentemente
3. **After POST/PUT/DELETE**: Si modificaste datos pero GET sigue devolviendo 304

## Cómo verificar si es problemático:

### 1. Revisar Headers en DevTools
```
Request Headers:
If-None-Match: "etag-value"
If-Modified-Since: Wed, 21 Sep 2025 10:00:00 GMT

Response Headers:
Status: 304 Not Modified
ETag: "etag-value"
Last-Modified: Wed, 21 Sep 2025 10:00:00 GMT
```

### 2. Testing con cURL (evita cache del navegador)
```bash
# Primera petición
curl -v http://localhost:3000/api/v2/messages/chat/123

# Segunda petición (debería ser 200, no 304)
curl -v http://localhost:3000/api/v2/messages/chat/123
```

### 3. Force Reload en DevTools
- Ctrl+Shift+R (Windows/Linux) o Cmd+Shift+R (Mac)
- Esto evita el cache del navegador

## Soluciones si 304 es problemático:

### 1. Disable Cache Headers (si es necesario)
```typescript
@Get('chat/:chatId')
@Header('Cache-Control', 'no-cache, no-store, must-revalidate')
@Header('Pragma', 'no-cache')
@Header('Expires', '0')
getChatMessages(...) {
  // Tu lógica
}
```

### 2. Añadir timestamp a la respuesta
```typescript
return {
  messages: messageDtos,
  total: searchResult.total,
  hasMore: searchResult.hasMore,
  nextCursor: searchResult.hasMore ? this.encodeCursor(...) : undefined,
  timestamp: new Date().toISOString(), // Esto evita 304
};
```

### 3. Usar query parameters únicos
```typescript
// En el frontend, añadir timestamp
const response = await fetch(`/api/v2/messages/chat/${chatId}?_t=${Date.now()}`);
```

## Conclusión
- **304 es normal** en la mayoría de casos
- **Solo es problema** si esperas datos nuevos que no llegan
- **Para mensajes de chat** normalmente queremos datos frescos, así que puede ser bueno evitar cache