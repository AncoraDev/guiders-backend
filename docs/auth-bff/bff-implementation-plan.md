# Resumen Ejecutivo: BFF + Cookies HttpOnly

## 🎯 Objetivo

Transformar la autenticación actual del backend para implementar un patrón **BFF (Backend For Frontend)** con **cookies HttpOnly** que mejore la seguridad y UX.

## 📦 Dependencias a Instalar

```bash
npm install cookie-parser express-session
npm install -D @types/cookie-parser @types/express-session
```

## 🔄 Archivos a Crear/Modificar

### Archivos NUEVOS a crear

1. **`src/context/auth/auth-user/infrastructure/strategies/jwt-cookie.strategy.ts`**
   - Estrategia JWT que lee tokens desde cookies en lugar de headers

2. **`src/context/shared/infrastructure/guards/jwt-cookie-auth.guard.ts`**
   - Guard que usa la estrategia de cookies

3. **`src/context/auth/bff/infrastructure/bff-auth.service.ts`**
   - Servicio para manejar login/logout con Keycloak y cookies

4. **`src/context/auth/bff/infrastructure/controllers/bff-auth.controller.ts`**
   - Controlador con endpoints: `/bff/auth/login`, `/bff/auth/refresh`, `/bff/auth/logout`, `/bff/auth/me`

5. **`src/context/auth/bff/infrastructure/bff.module.ts`**
   - Módulo que encapsula toda la funcionalidad BFF

6. **`src/context/shared/infrastructure/middleware/token-refresh.middleware.ts`**
   - Middleware para renovación automática de tokens

### Archivos EXISTENTES a modificar

1. **`src/main.ts`**
   - Añadir `app.use(cookieParser())`
   - CORS ya está configurado correctamente con `credentials: true`

2. **`src/app.module.ts`**
   - Importar `BFFModule`
   - Configurar middleware de renovación (opcional)

3. **`.env`**
   - Añadir variables: `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `SESSION_SECRET`

## 🔧 Configuración Requerida en Keycloak

### Cliente para BFF:

```json
{
  "clientId": "guiders-api",
  "protocol": "openid-connect",
  "publicClient": false,
  "directAccessGrantsEnabled": true,
  "serviceAccountsEnabled": true,
  "authorizationServicesEnabled": false
}
```

### URLs de redirección:

- **Valid Redirect URIs**: `http://localhost:3000/api/bff/auth/*`
- **Web Origins**: `http://localhost:4001` (frontend), `http://localhost:3000` (backend)

## 🚀 Nuevos Endpoints BFF

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/bff/auth/login` | Login con username/password → cookies HttpOnly |
| POST | `/api/bff/auth/refresh` | Renovar access token usando refresh cookie |
| POST | `/api/bff/auth/logout` | Logout + limpiar cookies |
| POST | `/api/bff/auth/me` | Obtener usuario autenticado desde cookie |

## 🍪 Flujo de Cookies

### Login exitoso:

```http
Set-Cookie: access_token=eyJ...; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Path=/
Set-Cookie: refresh_token=eyJ...; HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/api/auth
```

### Requests posteriores:

```http
Cookie: access_token=eyJ...; refresh_token=eyJ...
```

## 💡 Cambios en el Frontend

El frontend ahora solo necesita:

```javascript
// Login
fetch('/api/bff/auth/login', {
  method: 'POST',
  credentials: 'include', // ← Importante para cookies
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'user', password: 'pass' })
});

// Requests autenticadas
fetch('/api/protected-endpoint', {
  credentials: 'include' // ← Las cookies se envían automáticamente
});

// Logout
fetch('/api/bff/auth/logout', {
  method: 'POST',
  credentials: 'include'
});
```

## 🔒 Beneficios de Seguridad

1. **Anti-XSS**: Tokens inaccesibles desde JavaScript
2. **Anti-CSRF**: SameSite=Strict + verificación de origen
3. **Renovación transparente**: Sin interrupciones para el usuario
4. **Rotación automática**: Refresh tokens rotan en cada uso

## ⚡ Plan de Implementación

### Fase 1: Base
1. Instalar dependencias
2. Crear estrategia JWT-Cookie
3. Crear guard BFF
4. Modificar main.ts

### Fase 2: Servicios
1. Implementar BFFAuthService
2. Crear controlador BFF
3. Configurar módulo BFF

### Fase 3: Integración
1. Añadir al AppModule
2. Configurar Keycloak
3. Probar endpoints

### Fase 4: Optimización
1. Middleware de renovación automática
2. Manejo de errores avanzado
3. Logging y métricas

## 🧪 Testing

```typescript
// Ejemplo de test
describe('BFF Auth Controller', () => {
  it('should set httpOnly cookies on login', async () => {
    const response = await request(app)
      .post('/api/bff/auth/login')
      .send({ username: 'test', password: 'test' })
      .expect(200);
      
    expect(response.headers['set-cookie']).toContain('access_token');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
  });
});
```

## 📊 Comparativa: Antes vs Después

| Aspecto | Actual (JWT en Headers) | BFF + Cookies HttpOnly |
|---------|------------------------|------------------------|
| **Almacenamiento** | localStorage/sessionStorage | Cookies HttpOnly |
| **Acceso desde JS** | ✅ Accesible | ❌ Inaccesible (más seguro) |
| **Vulnerabilidad XSS** | ⚠️ Alta | ✅ Baja |
| **Renovación** | Manual | ✅ Automática |
| **CORS** | Headers manuales | ✅ Automático |
| **Complejidad Frontend** | ⚠️ Media | ✅ Baja |

¿Por dónde quieres empezar la implementación?
