# Diario del servidor

Notas con fecha, para poder repasarlo. Sin contraseñas.

---

## 23 septiembre 2026 — primer día

VPS nuevo: `187.33.147.104` · Ubuntu 26.04 · 1 CPU · 4 GB RAM · 10 GB disco.

### Qué hicimos

1. Al principio no entraba: el puerto 22 aún no estaba listo, y la clave del Mac no estaba en el servidor.
2. Entramos **una vez** con la contraseña de root del panel.
3. Dejamos la clave pública (`~/.ssh/id_ed25519.pub`). Desde entonces:
   `ssh deploy@187.33.147.104` (sin escribir contraseña).
4. Lanzamos `bootstrap.sh`. Eso instaló:
   - Docker — bases de datos y Keycloak
   - Node 20 + PM2 — para arrancar la API y que siga tras un reboot
   - nginx + certbot — HTTPS (aún no hay certificado: falta dominio)
   - usuario `deploy` — el de GitHub Actions; no usamos root para el día a día
   - carpetas `/var/www/guiders-backend` y `/var/www/guiders-frontend`
   - firewall: solo 22 (SSH), 80 (HTTP) y 443 (HTTPS)
5. Swap a 2 GB (disco usado como RAM extra; con 4 GB Keycloak se queda corto).
6. PM2 con 1 proceso (`ecosystem.small.config.js`). El repo pide 2 y esta máquina no da.

### Comprobar

```bash
ssh deploy@187.33.147.104
docker --version && node -v && nginx -v
sudo ufw status
df -h && free -h
```

El 23/09: ~5,5 GB libres, swap 2 GB.

### Recuerda

- Cambia la contraseña de root en el panel (salió por el chat).
- No abras 5432, 27017, 6379, 8080: las bases de datos solo en localhost.
- 10 GB se llena con Docker. Mejor ampliar disco **antes** de seguir.
- Sin dominio no hay HTTPS.

### Aún no

Dominio, `docker compose`, certificados, ni deploy de la app.

Cuando tengas dominio: `api`, `console`, `admin` y `auth` → `187.33.147.104`.

---

## 23 septiembre 2026 — tarde

Ampliado en el panel: **8 GB RAM** y **40 GB disco** (queda ~32 GB libres).

Siguiente paso: Docker de **infra** en el VPS (Postgres, Mongo, Redis, Keycloak),
con un `.env` nuevo. **No** copiar datos de local todavía. **No** usar
puertos 4200/4201 en el servidor (eso es el frontend en el Mac).

---

## 23 septiembre 2026 — infra Docker

Levantado en el VPS (datos **vacíos**, no los de local):

- Postgres `127.0.0.1:5432`
- Mongo `127.0.0.1:27017`
- Redis `127.0.0.1:6379`
- Keycloak `127.0.0.1:8080` (solo en la máquina; el firewall no lo abre a internet)

`.env.production` está en el server (`chmod 600`), no en git.
Compose: `docker/docker-compose.vps.yml`.

Comprobar: `ssh deploy@187.33.147.104` → `docker ps`

Aún no: dominio, Nest/PM2, frontend, ni realm `guiders` (Keycloak solo tiene `master`).

---

## 23 septiembre 2026 — DNS + HTTPS (parcial)

| Host | IP | HTTPS |
|------|----|-------|
| `guiders-console.ancoradual.com` | `187.33.147.104` | sí (Let's Encrypt, caduca 22/12/2026) |
| `guiders-admin.ancoradual.com` | `187.33.147.104` | sí |

Ahora mismo solo hay una página de “pendiente de deploy”. La app Angular aún no está.

**Faltan dos DNS** (mismo patrón, misma IP):

- `guiders-api.ancoradual.com` → API / BFF / WebSocket
- `guiders-auth.ancoradual.com` → Keycloak

Sin esos no hay login.

---

## 23 septiembre 2026 — API y Auth con HTTPS

Los cuatro hosts apuntan a `187.33.147.104` y tienen certificado.

| URL | Estado |
|-----|--------|
| https://guiders-console.ancoradual.com | página temporal |
| https://guiders-admin.ancoradual.com | página temporal |
| https://guiders-auth.ancoradual.com | Keycloak (realm `master`; aún no `guiders`) |
| https://guiders-api.ancoradual.com | **502** — Nest/PM2 todavía no está |

Siguiente: primer deploy del backend (PM2) y crear el realm `guiders` en Keycloak.

---

## 23 septiembre 2026 — backend y realm

- Realm Keycloak `guiders` con clients `console` y `admin`, roles admin / commercial / supervisor / superadmin.
- Esquema Postgres creado (las migraciones del repo no partían de cero; se sincronizó una vez y se marcaron).
- Nest en PM2 (`ecosystem.small.config.js`, 1 proceso).
- https://guiders-api.ancoradual.com/api responde **200**.

Aún no hay usuarios ni el frontend Angular. El login no va hasta desplegar Console/Admin y crear un usuario en Keycloak.

---

## 23 septiembre 2026 — datos locales + frontend

Copiado de tu Mac al VPS (sin pasar por git):

- Postgres (2 empresas, 3 usuarios)
- Mongo (chats, visitors, CRM, etc.)
- Keycloak (mismos usuarios/contraseñas que en local)
- Clave de cifrado CRM (para que LeadCars se pueda leer)

Clients de Keycloak apuntan ya a ancoradual.com.

Frontend publicado:

- https://guiders-console.ancoradual.com
- https://guiders-admin.ancoradual.com

Entra con el **mismo usuario y contraseña** que usas en local.
