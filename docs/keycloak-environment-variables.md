# Variables de Entorno - Configuración Unificada

## Resumen de Cambios

Se han simplificado y unificado las variables de entorno para soportar dos clientes BFF (Console y Admin) con una configuración consistente. **API_AUDIENCE** se ha eliminado, ya que siempre es `account`.

## Variables de Keycloak (Autenticación JWT)

Para validación de tokens JWT en las estrategias de autenticación:

- `KEYCLOAK_ISSUER`: URL del issuer de Keycloak
- `KEYCLOAK_JWKS_URI`: URL del endpoint JWKS de Keycloak  
- `KEYCLOAK_AUDIENCE`: Audiencia del token JWT (siempre `account`)

## Variables de Keycloak Admin API (CRUD usuarios Console)

Usadas por `KeycloakAdminService` para alta/edición/desactivación/borrado de usuarios de compañía:

- `KEYCLOAK_URL`: URL base de Keycloak (ej. `http://localhost:8080`)
- `KEYCLOAK_REALM`: Realm (por defecto `guiders`)
- `KEYCLOAK_ADMIN_USERNAME` (o `KEYCLOAK_ADMIN`): usuario admin del realm master
- `KEYCLOAK_ADMIN_PASSWORD`: contraseña del admin

También se usa `OIDC_CONSOLE_CLIENT_ID` como `client_id` en `execute-actions-email` (definir contraseña).

## Variables BFF (Clientes OIDC)

### Cliente Console

- `OIDC_CONSOLE_CLIENT_ID`: ID del cliente console en Keycloak
- `OIDC_CONSOLE_REDIRECT_URI`: URI de callback para console

### Cliente Admin

- `OIDC_ADMIN_CLIENT_ID`: ID del cliente admin en Keycloak
- `OIDC_ADMIN_REDIRECT_URI`: URI de callback para admin

## Configuración por Entorno

### Desarrollo (`.env`)

```bash
# Keycloak JWT
KEYCLOAK_ISSUER=http://localhost:8080/realms/guiders
KEYCLOAK_JWKS_URI=http://localhost:8080/realms/guiders/protocol/openid-connect/certs
KEYCLOAK_AUDIENCE=account

# Keycloak Admin API (CRUD usuarios)
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=guiders
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin123

# BFF - Clientes OIDC
OIDC_ISSUER=http://localhost:8080/realms/guiders
OIDC_CONSOLE_CLIENT_ID=console
OIDC_CONSOLE_REDIRECT_URI=http://localhost:3000/api/bff/auth/callback/console
OIDC_ADMIN_CLIENT_ID=admin
OIDC_ADMIN_REDIRECT_URI=http://localhost:3000/api/bff/auth/callback/admin
```

### Staging

Las siguientes variables deben configurarse como **GitHub Secrets**:

- `STAGING_KEYCLOAK_ISSUER`: URL del issuer para staging
- `STAGING_KEYCLOAK_JWKS_URI`: URL del JWKS para staging (opcional, se deriva del issuer)

### Producción

Las siguientes variables deben configurarse como **GitHub Secrets**:

- `KEYCLOAK_ISSUER`: URL del issuer para producción
- `KEYCLOAK_JWKS_URI`: URL del JWKS para producción (opcional, se deriva del issuer)

## Configuración en GitHub

Para configurar estas variables en GitHub:

1. Ve a tu repositorio en GitHub
2. Navega a `Settings` > `Secrets and variables` > `Actions`
3. Haz clic en `New repository secret`
4. Añade cada variable con su valor correspondiente

### Ejemplo de valores típicos

```bash
# Staging
STAGING_KEYCLOAK_ISSUER=https://auth-staging.guiders.es/realms/guiders
STAGING_KEYCLOAK_JWKS_URI=https://auth-staging.guiders.es/realms/guiders/protocol/openid-connect/certs

# Producción
KEYCLOAK_ISSUER=https://auth.guiders.es/realms/guiders
KEYCLOAK_JWKS_URI=https://auth.guiders.es/realms/guiders/protocol/openid-connect/certs
```

## Fallback Values

El código incluye valores de fallback que apuntan a la configuración de producción actual:

## Fallback Values

El código incluye valores de fallback seguros:

```typescript
// Estrategias JWT
issuer: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/guiders'
jwksUri: process.env.KEYCLOAK_JWKS_URI || 'http://localhost:8080/realms/guiders/protocol/openid-connect/certs'
audience: process.env.KEYCLOAK_AUDIENCE || 'account'

// Clientes BFF
clientId: process.env.OIDC_CONSOLE_CLIENT_ID || 'console'
clientId: process.env.OIDC_ADMIN_CLIENT_ID || 'admin'
```

## Verificación

Para verificar que las variables están correctamente configuradas:

1. **Desarrollo**: Revisar el archivo `.env` local
2. **Staging/Producción**: Verificar los logs de deployment en GitHub Actions
3. **Runtime**: Verificar que la autenticación JWT funciona correctamente

## Troubleshooting

### Error: Token inválido

Verificar que `KEYCLOAK_AUDIENCE` coincida con la audiencia configurada en el cliente de Keycloak (siempre debe ser `account`).

### Error: JWKS no encontrado

Verificar que `KEYCLOAK_JWKS_URI` sea accesible desde el servidor de la aplicación.


