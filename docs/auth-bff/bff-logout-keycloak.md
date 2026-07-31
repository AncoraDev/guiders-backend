# Logout Completo con Keycloak SSO

## Problema Original

Cuando se hacía logout desde la aplicación, solo se revocaban los tokens y se limpiaban las cookies de la app, pero **la sesión SSO de Keycloak permanecía activa**. Esto causaba que al redirigir al login, Keycloak automáticamente volvía a autenticar al usuario sin pedir credenciales.

## Solución Implementada

Ahora el logout realiza un **logout completo de Keycloak**, terminando también la sesión SSO.

### Flujo de Logout Actual

1. **Frontend** → `window.location.href = '/api/bff/auth/logout/console'`
2. **Backend** revoca el refresh token de la app
3. **Backend** limpia cookies de sesión de la app
4. **Backend** redirige al **endpoint de logout de Keycloak** (`end_session_endpoint`)
5. **Keycloak** cierra la sesión SSO (elimina cookie `KEYCLOAK_SESSION`)
6. **Keycloak** redirige de vuelta a `post_logout_redirect_uri` (login de la app)
7. **Usuario** ve la pantalla de login de Keycloak (requiere credenciales)

### Cambios en el Código

#### 1. Nuevo método en `OidcService`

```typescript
// src/context/auth/bff/infrastructure/services/oidc.service.ts

buildLogoutUrl(opts?: {
  postLogoutRedirectUri?: string;
  idTokenHint?: string;
}): string {
  // Construye URL al end_session_endpoint de Keycloak
  // con post_logout_redirect_uri para volver a la app
}
```

#### 2. Actualización en `BffController.doLogout()`

```typescript
// Antes: Solo limpiaba cookies locales y redirigía a /login
return res.redirect(`/api/bff/auth/login/${app}`);

// Ahora: Redirige al logout de Keycloak
const keycloakLogoutUrl = this.oidc.buildLogoutUrl({
  postLogoutRedirectUri: `${BACKEND_URL}/api/bff/auth/login/${app}`,
});
return res.redirect(keycloakLogoutUrl);
```

### Configuración Requerida

#### Variables de Entorno

Agregar al `.env`:

```bash
# URL base del backend para construir redirect URIs
BACKEND_URL=http://localhost:3000  # desarrollo
# BACKEND_URL=https://api.guiders.es  # producción
```

#### Frontend

**NO necesita cambios**. El logout sigue siendo:

```typescript
const logout = () => {
  window.location.href = '/api/bff/auth/logout/console';
};
```

### URLs Involucradas

**Desarrollo:**

```text
1. Frontend → http://localhost:3000/api/bff/auth/logout/console
2. Backend → http://localhost:8080/realms/guiders/protocol/openid-connect/logout?post_logout_redirect_uri=...
3. Keycloak → http://localhost:3000/api/bff/auth/login/console
4. Backend → http://localhost:8080/realms/guiders/protocol/openid-connect/auth?...
5. Usuario ve login de Keycloak
```

**Producción:**

```text
1. Frontend → https://api.guiders.es/api/bff/auth/logout/console
2. Backend → https://sso.guiders.es/realms/guiders/protocol/openid-connect/logout?post_logout_redirect_uri=...
3. Keycloak → https://api.guiders.es/api/bff/auth/login/console
4. Backend → https://sso.guiders.es/realms/guiders/protocol/openid-connect/auth?...
5. Usuario ve login de Keycloak
```

### Parámetros del Logout de Keycloak

El logout de Keycloak acepta estos parámetros:

- `post_logout_redirect_uri` (recomendado): URL a la que volver después del logout
- `id_token_hint` (requerido por Keycloak): ID token para verificar la sesión a cerrar
- `client_id` (opcional): ID del cliente que solicita el logout

**Implementación actual**: Usamos `post_logout_redirect_uri` + `id_token_hint` (requerido).

### Gestión del ID Token

Para cumplir con el requisito de Keycloak, ahora guardamos el `id_token` en una cookie adicional:

**Cookies creadas durante el login:**

- `console_session` (o `admin_session`): access_token
- `console_refresh` (o `admin_refresh`): refresh_token
- `console_session_id` (o `admin_session_id`): **id_token** ← Nueva cookie

**En el logout:**

1. Leemos el `id_token` de la cookie `{sessionName}_id`
2. Lo pasamos como `id_token_hint` al endpoint de logout de Keycloak
3. Limpiamos todas las cookies (incluida la del id_token)

**Comportamiento:**

- Si el id_token está presente → logout exitoso en Keycloak
- Si el id_token falta → Keycloak muestra error "Missing parameters: id_token_hint"

### Fallback

Si falla la construcción de la URL de logout de Keycloak (por ejemplo, servidor OIDC no disponible), el sistema hace **fallback a logout local**, redirigiendo directamente al login:

```typescript
catch (error) {
  this.logger.warn(`No se pudo construir URL de logout de Keycloak`);
  return res.redirect(`/api/bff/auth/login/${app}`);
}
```

### Testing

**Verificar logout completo:**

1. Iniciar sesión → debería pedir credenciales
2. Navegar en la app → sesión activa
3. Hacer logout
4. **Verificar**: Debe redirigir a Keycloak y pedir credenciales nuevamente
5. **NO debe** hacer auto-login silencioso

**Verificar cookies:**

En DevTools → Application → Cookies:

- Después del logout, las cookies de la app deben estar eliminadas
- La cookie `KEYCLOAK_SESSION` de Keycloak también debe estar eliminada

### Referencias

- [Keycloak OIDC Logout](https://www.keycloak.org/docs/latest/securing_apps/#logout)
- [OpenID Connect RP-Initiated Logout](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
