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

---

## 23 septiembre 2026 — login Console 502

El backend respondía bien. nginx cortaba el callback BFF (`/api/bff/auth/callback/console`) porque las cookies JWT (access + refresh + id_token) no cabían en el buffer de 4k.

Subidos `proxy_buffer_size` / `proxy_buffers` en el site de la API. Recarga nginx hecha. Vuelve a entrar en Console.

---

## 23 septiembre 2026 — demo del pixel

Quinto host: `https://guiders-demo.ancoradual.com`

Página estática con el SDK apuntando a `guiders-api`. Empresa **Demo Rmotion**. En Console, Atención → Conectado, y escribe desde esa web.

Luego se copió la demo PHP local (`guiders-sdk/demo/app`: inicio, tienda, vehículos, etc.) y se instaló php-fpm. El header usa API/WebSocket de ancoradual solo en ese host.

---

## 23 septiembre 2026 — dos entornos y `main`

Hay **dos stacks**. Lo que pasa en uno no cambia el otro.

**Local (Mac):** API `localhost:3000`, Console/Admin `:4200`/`:4201`, demo PHP `:8083`, Docker local.

**Producción (VPS `187.33.147.104`):**

| URL | Qué es |
|-----|--------|
| https://guiders-console.ancoradual.com | Console |
| https://guiders-admin.ancoradual.com | Admin |
| https://guiders-api.ancoradual.com | Nest (REST, BFF, WebSocket) |
| https://guiders-auth.ancoradual.com | Keycloak |
| https://guiders-demo.ancoradual.com | Web de prueba del pixel (PHP) |

La producción nació con una copia de los datos locales. A partir de ahora cada una tiene su base.

### Código

`sergi-version-v1` se pasó a `main` en los tres repos (backend, frontend, SDK). En backend se mezcló también el embed que ya estaba en `main` (sin conflictos).

Un push a `main` **no publica** al VPS: faltan secrets de GitHub. El Action se salta el deploy si no hay `PROD_HOST`.

### Cómo publicar un cambio funcional (mientras tanto)

1. Backend: `npm run build` → copiar `dist/` al VPS → `pm2 restart guiders-backend`
2. Frontend: build prod de console/admin → `rsync` a `releases/<fecha>/` → `ln -sfn` a `current`
3. Demo/pixel: `npm run build` en el SDK → copiar `demo/app` + `dist/index.js` como `guiders-sdk.js`

Datos, Keycloak y `.env` del VPS no se tocan con eso.

---

## 23 septiembre 2026 — widget desde Console

El plugin de WordPress ya no configura el chat. Solo instala el pixel (API key, entorno, tracking).

La config vive en la empresa (`companies.widget_config`):

- Admin en Console: **Configuración → Chat web** (`/settings/widget`)
- API admin: `GET/PUT /api/me/company/widget-config` (rol admin)
- Pixel: `GET /api/v2/widget/config?domain=&apiKey=`

Campos: chat on/off, auto-abrir, color (system/light/dark), tema (default/carbon), posición escritorio/móvil.

Si no hay fila o falla la red, el pixel usa: chat on, auto-abrir on, color system, tema default, esquina inferior derecha.

Horarios, Quick Actions e IA se quitaron de WP. La disponibilidad comercial la sigue mandando el toggle **Conectado** de Atención, no el plugin.

En local hay que correr la migración `AddWidgetConfig` (ya aplicada en este Mac). En el VPS, lo mismo al publicar el backend.

Detalle: [`docs/company/widget-config.md`](../../company/widget-config.md)

---

## 23 septiembre 2026 — historial de páginas

En Atención solo se veía la última URL: `identify` pisa `currentUrl` y los `PAGE_VIEW` del pixel se perdían en WordPress (track antes de identify / sin sessionId).

Ahora cada identify con URL guarda un `PAGE_VIEW` (dedup 30s). El SDK espera identify y vuelve a emitir `page_view`. Console prepend en `visitor:page-changed`.

Autopractik 2.14.0 historiará al publicar este backend. Plugin nuevo solo si se quiere el arreglo del SDK en la web.

---

## 23 septiembre 2026 — widget hilo único (2.14.1)

Se quitó el selector de chats del visitante («Nueva conversación»). Un visitante = un hilo; los días se marcan en el widget y en Atención.

Identify corre **después** de crear ChatUI. Si no, el `await` del page-view dejaba `chatId` a null y Console/web no compartían el hilo.

Para verlo en Autopractik hay que actualizar el plugin a **2.14.1** (ZIP o GitHub Release). Backend y Console no cambian. Demo VPS: copiar el `guiders-sdk.js` nuevo a `/var/www/guiders-demo`.

---

## 24 septiembre 2026 — cierre del guion sin pedir datos

En Captación cada rama puede terminar así:

- `null` → formulario de contacto (como hasta ahora)
- `__end__` → «Terminar sin pedir datos»

Hay que publicar API + Console + pixel. Autopractik necesita el plugin **2.14.2** para que el visitante no caiga al formulario si elige esa rama.

---

## 24 septiembre 2026 — formulario del asistente (2.14.3)

El último paso del guion pide solo **Nombre, Email, Teléfono y Comentarios**, todos obligatorios, más la casilla de privacidad. Sin casilla de comunicaciones, sin apellidos y sin población.

El comentario se guarda en el lead (`additionalData.comentario`) y se ve en el hilo de Atención y en la ficha del visitante.

Autopractik necesita el plugin **2.14.3**. El formulario que pide el comercial en el chat no cambia.
