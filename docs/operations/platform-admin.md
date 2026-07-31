# Admin plataforma Guiders (superadmin)

Herramienta interna para el equipo Guiders: alta de clientes (company + admin), API keys del widget/plugin y gestión de usuarios de cualquier company.

## Quién puede entrar

- App Admin (`http://localhost:4201`) exige rol **`superadmin`**.
- El `admin` de cada cliente usa **Console** (`:4200`) → Usuarios para gestionar su equipo.
- El equipo Guiders puede además gestionar usuarios de **cualquier** company desde Admin → **Usuarios**.

## Seed local de un superadmin

1. Crea (si no existe) la company interna Guiders:

```bash
node bin/guiders-cli.js create-company --name "Guiders" --domain "guiders.local"
```

Anota el `companyId` (o consulta BD / `get-apikeys`).

2. En Keycloak (realm Guiders), crea un usuario staff con rol de realm `superadmin` (o `super-admin` / `super_admin`).

3. Vincula el usuario en BD:

```bash
node bin/guiders-cli.js create-user-from-keycloak \
  --keycloak-id "<UUID-KC>" \
  --email "ops@guiders.local" \
  --name "Guiders Ops" \
  --company-id "<GUIDERS_COMPANY_ID>" \
  --role SUPERADMIN
```

4. Entra en Admin con ese usuario vía BFF login.

## Flujo operativo: alta de cliente

1. Admin → **Clientes** → **Nuevo cliente**.
2. Indica nombre, dominio (y aliases), nombre/email del admin del cliente.
3. Backend:
   - Crea la company y sites.
   - Genera API keys widget por dominio (`CompanyCreatedEvent`).
   - Crea el admin en **Keycloak** con **contraseña temporal** (sin email).
4. Entregas email + contraseña temporal al admin del cliente. En el **primer login** Keycloak exige crear una nueva contraseña.
5. En el detalle del cliente (Admin) copias la API key para el plugin WordPress / SDK.

## API (backend)

Auth DualAuth + rol `superadmin`.

### Companies

| Método | Path | Uso |
|--------|------|-----|
| GET | `/api/platform/companies` | Listado |
| GET | `/api/platform/companies/:id` | Detalle |
| POST | `/api/platform/companies` | Alta company + admin |
| GET | `/api/platform/companies/:id/api-keys` | Keys widget |
| POST | `/api/platform/companies/:id/api-keys` | Crear/reutilizar key `{ domain }` |

### Users

| Método | Path | Uso |
|--------|------|-----|
| GET | `/api/platform/users` | Listado global + summary |
| POST | `/api/platform/users` | Crear en company `{ companyId, firstName, lastName, email, phone?, roles, temporaryPassword }` |
| PATCH | `/api/platform/users/:userId` | Actualizar `{ name?, roles? }` |
| PATCH | `/api/platform/users/:userId/active` | Activar/desactivar `{ isActive }` |
| DELETE | `/api/platform/users/:userId` | Borrado duro (BD + Keycloak) |

Roles asignables desde UI/API: `admin`, `commercial`, `supervisor`. El rol `superadmin` se sigue dando por CLI/ops.

Los endpoints públicos antiguos `POST /api/company` y `POST /api/api-keys/create` ahora requieren `superadmin` (deprecados; usar platform).

## CLI (opcional)

`create-company-with-admin` usa el mismo camino Keycloak (ya no invite local).
