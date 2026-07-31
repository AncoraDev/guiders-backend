# BFF Múltiples Clientes - Console y Admin

Este documento explica cómo configurar y usar múltiples clientes en el sistema BFF (Backend for Frontend) para soportar tanto la aplicación Console como la aplicación Admin.

## Arquitectura

El sistema BFF ahora soporta múltiples aplicaciones cliente:
- **Console**: Aplicación principal de usuarios
- **Admin**: Aplicación administrativa

Cada aplicación tiene:
- Su propio cliente OIDC en Keycloak
- Cookies de sesión separadas
- URIs de redirección específicas

## Configuración de Variables de Entorno

### Desarrollo (`.env`)

```bash
# OIDC - Configuración general
OIDC_ISSUER=http://localhost:8080/realms/guiders

# OIDC - Cliente Console
OIDC_CONSOLE_CLIENT_ID=console
OIDC_CONSOLE_REDIRECT_URI=http://localhost:3000/api/bff/auth/callback/console

# OIDC - Cliente Admin
OIDC_ADMIN_CLIENT_ID=admin
OIDC_ADMIN_REDIRECT_URI=http://localhost:3000/api/bff/auth/callback/admin

# Cookies por aplicación
SESSION_COOKIE_CONSOLE=console_session
REFRESH_COOKIE_CONSOLE=console_refresh
SESSION_COOKIE_ADMIN=admin_session
REFRESH_COOKIE_ADMIN=admin_refresh

# Orígenes permitidos para redirección
ALLOW_RETURN_TO=http://localhost:4200,http://localhost:4201
```

### Staging/Producción

Las variables están configuradas en el workflow de GitHub Actions:

```yaml
# BFF Configuration
OIDC_ISSUER: ${{ secrets.STAGING_KEYCLOAK_ISSUER }}
OIDC_CONSOLE_CLIENT_ID: console
OIDC_CONSOLE_REDIRECT_URI: ${{ secrets.STAGING_APP_URL }}/api/bff/auth/callback/console
OIDC_ADMIN_CLIENT_ID: admin
OIDC_ADMIN_REDIRECT_URI: ${{ secrets.STAGING_APP_URL }}/api/bff/auth/callback/admin
```

## Configuración de Keycloak

### Automática

Usar el script mejorado para configurar ambos clientes:

```bash
# Configurar todos los clientes
node bin/keycloak-configure-client.js

# Configurar solo console
node bin/keycloak-configure-client.js console

# Configurar solo admin
node bin/keycloak-configure-client.js admin
```

### Manual

Crear dos clientes OIDC en Keycloak:

1. **Cliente Console** (`console`)
   - Client ID: `console`
   - Redirect URIs: `http://localhost:3000/api/bff/auth/callback/console`
   - Web Origins: `http://localhost:4200`

2. **Cliente Admin** (`admin`)
   - Client ID: `admin`
   - Redirect URIs: `http://localhost:3000/api/bff/auth/callback/admin`
   - Web Origins: `http://localhost:4201`

Ambos clientes deben ser:
- Public clients
- Standard Flow habilitado
- PKCE habilitado (`pkce.code.challenge.method: S256`)

## Rutas de API

### Console App (existentes, retrocompatibles)

```
GET  /api/bff/auth/login                    # Usa console por defecto
GET  /api/bff/auth/login/console            # Explícito para console
GET  /api/bff/auth/callback/console         # Callback para console
GET  /api/bff/auth/me                       # Info usuario console
POST /api/bff/auth/refresh                  # Refresh token console
POST /api/bff/auth/logout                   # Logout console
```

### Admin App (nuevas)

```
GET  /api/bff/auth/login/admin              # Login admin
GET  /api/bff/auth/callback/admin           # Callback admin
GET  /api/bff/auth/me/admin                 # Info usuario admin
POST /api/bff/auth/refresh/admin            # Refresh token admin
POST /api/bff/auth/logout/admin             # Logout admin
```

## Uso desde Frontend

### Console App (Puerto 4200)

```javascript
// Login
window.location.href = '/api/bff/auth/login/console?redirect=/dashboard';

// Verificar autenticación
fetch('/api/bff/auth/me')
  .then(res => res.json())
  .then(user => {
    console.log('Usuario console:', user);
    // user.app === 'console'
  });

// Refresh token
fetch('/api/bff/auth/refresh', { method: 'POST' });

// Logout
fetch('/api/bff/auth/logout', { method: 'POST' });
```

### Admin App (Puerto 4201)

```javascript
// Login
window.location.href = '/api/bff/auth/login/admin?redirect=/admin-dashboard';

// Verificar autenticación
fetch('/api/bff/auth/me/admin')
  .then(res => res.json())
  .then(user => {
    console.log('Usuario admin:', user);
    // user.app === 'admin'
  });

// Refresh token
fetch('/api/bff/auth/refresh/admin', { method: 'POST' });

// Logout
fetch('/api/bff/auth/logout/admin', { method: 'POST' });
```

## Cookies y Aislamiento

### Console App
- Cookie de sesión: `console_session`
- Cookie de refresh: `console_refresh`
- Dominio: localhost (desarrollo)

### Admin App
- Cookie de sesión: `admin_session`
- Cookie de refresh: `admin_refresh`
- Dominio: localhost (desarrollo)

Las cookies están completamente aisladas entre aplicaciones, permitiendo:
- Sesiones independientes
- Timeouts diferentes
- Logout individual sin afectar la otra app

## Desarrollo

### Iniciar ambas aplicaciones

```bash
# Terminal 1: Backend
npm run start:dev

# Terminal 2: Console App (Puerto 4200)
cd ../console-frontend
npm run start

# Terminal 3: Admin App (Puerto 4201)
cd ../admin-frontend  
npm run start -- --port 4201
```

### Configurar clientes en Keycloak

```bash
# Configurar ambos clientes automáticamente
node bin/keycloak-configure-client.js
```

### Testing

Probar ambos flujos:

1. Console: http://localhost:4200 → Login → /api/bff/auth/login/console
2. Admin: http://localhost:4201 → Login → /api/bff/auth/login/admin

Verificar que las cookies se establezcan correctamente y las sesiones sean independientes.

## Troubleshooting

### Problema: Console app no funciona después de añadir admin

**Causa**: Las rutas por defecto mantienen compatibilidad hacia atrás.

**Solución**: Las rutas sin `/app` siguen funcionando para console:
- `/api/bff/auth/login` = `/api/bff/auth/login/console`
- `/api/bff/auth/me` = `/api/bff/auth/me/console`

### Problema: Cookies no se establecen

**Verificar**:
1. Variables de entorno para cada app
2. Configuración de CORS en backend
3. SameSite policy (usar `lax` en desarrollo)
4. Secure flag (`false` en HTTP local)

### Problema: Redirect loops

**Verificar**:
1. `ALLOW_RETURN_TO` incluye ambos orígenes
2. URIs de redirección correctos en Keycloak
3. WebOrigins configurados en Keycloak

## Migración

Para aplicaciones existentes:
1. Las rutas console existentes siguen funcionando
2. Añadir nuevas rutas admin gradualmente  
3. Configurar cliente admin en Keycloak
4. Desplegar sin breaking changes
