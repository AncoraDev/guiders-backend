# DNS y mapa nginx

Sustituye `__DOMAIN__` por el dominio que controles (p. ej. `midominio.com`).
No reutilices `guiders.es` / `guiders.app` en un servidor nuevo salvo que
sigan siendo tuyos y apunten a esta IP.

## Mapa DNS

Crea estos registros **antes** de certbot (Let’s Encrypt valida el hostname).

| Tipo | Nombre | Valor | TTL |
|------|--------|-------|-----|
| A | `api.__DOMAIN__` | `187.33.147.104` | 300 |
| A | `console.__DOMAIN__` | `187.33.147.104` | 300 |
| A | `admin.__DOMAIN__` | `187.33.147.104` | 300 |
| A | `auth.__DOMAIN__` | `187.33.147.104` | 300 |
| A (opcional) | `__DOMAIN__` | `187.33.147.104` | 300 |
| CNAME (opcional) | `www.__DOMAIN__` | `__DOMAIN__` | 300 |

AAAA si el VPS tiene IPv6. Comprueba:

```bash
dig +short api.__DOMAIN__
dig +short console.__DOMAIN__
dig +short admin.__DOMAIN__
dig +short auth.__DOMAIN__
```

## Mapa nginx (qué termina dónde)

```
https://api.__DOMAIN__          → 127.0.0.1:3000   (Nest: REST + BFF + /socket.io)
https://api.__DOMAIN__/api      → mismo upstream   (prefijo que usa el frontend)
https://console.__DOMAIN__      → current/console  (SPA Angular, try_files)
https://admin.__DOMAIN__        → current/admin    (SPA Angular, try_files)
https://auth.__DOMAIN__         → 127.0.0.1:8080   (Keycloak, cabeceras X-Forwarded-*)
https://__DOMAIN__              → 301 console      (opcional)
```

Nest **no** va en Docker en prod. Docker es Postgres, Mongo, Redis y Keycloak.
PM2 escucha el `PORT` del `.env` (típicamente `3000`). nginx termina TLS.

Callbacks OIDC (deben coincidir con Keycloak *y* con secrets):

- `https://api.__DOMAIN__/api/bff/auth/callback/console`
- `https://api.__DOMAIN__/api/bff/auth/callback/admin`

WebSocket: el frontend usa `wsUrl` **sin** `/api` (`https://api.__DOMAIN__`).
nginx debe hacer upgrade en `/socket.io`.

## Instalar las plantillas

En el VPS, desde una copia de este directorio:

```bash
DOMAIN=midominio.com   # tu dominio real
SRC=/var/www/guiders-backend/docs/ops/new-server/nginx
for f in guiders-api.conf guiders-console.conf guiders-admin.conf guiders-auth.conf guiders-apex.conf; do
  sed "s/__DOMAIN__/${DOMAIN}/g" "$SRC/$f" | sudo tee "/etc/nginx/sites-available/$f" >/dev/null
done
sudo ln -sfn /etc/nginx/sites-available/guiders-api.conf /etc/nginx/sites-enabled/
sudo ln -sfn /etc/nginx/sites-available/guiders-console.conf /etc/nginx/sites-enabled/
sudo ln -sfn /etc/nginx/sites-available/guiders-admin.conf /etc/nginx/sites-enabled/
sudo ln -sfn /etc/nginx/sites-available/guiders-auth.conf /etc/nginx/sites-enabled/
# opcional:
# sudo ln -sfn /etc/nginx/sites-available/guiders-apex.conf /etc/nginx/sites-enabled/

sudo nginx -t
```

Primera vez (HTTP only para el challenge ACME): las plantillas incluyen un
`server` en el puerto 80. Luego:

```bash
sudo certbot --nginx \
  -d api.__DOMAIN__ \
  -d console.__DOMAIN__ \
  -d admin.__DOMAIN__ \
  -d auth.__DOMAIN__
# + apex/www si habilitaste guiders-apex.conf
sudo systemctl reload nginx
```

Certbot reescribe los bloques 443. Si prefieres certificados a mano, las
rutas esperadas en las plantillas son
`/etc/letsencrypt/live/<fqdn>/{fullchain,privkey}.pem`.

## Checklist post-nginx

- [ ] `curl -I https://api.__DOMAIN__/api` no es 502 (Nest/PM2 arriba)
- [ ] Consola del navegador: WebSocket `wss://api.__DOMAIN__/socket.io` 101
- [ ] `https://auth.__DOMAIN__/realms/guiders` responde JSON (realm existe)
- [ ] Login Console redirige a Keycloak y vuelve a `console.__DOMAIN__`
- [ ] Login Admin igual hacia `admin.__DOMAIN__`
- [ ] Cookies `console_session` / `admin_session` salen `Secure` en `api.__DOMAIN__`

## Mapa legado (solo referencia)

El código/CI antiguo asumía `guiders.es` (API en el apex),
`console.guiders.es`, `admin.guiders.es`, `auth.guiders.es`. El mapa nuevo
separa la API en `api.` para no mezclar estáticos y Nest en el mismo host.
Si heredas esos FQDN, cambia `__DOMAIN__` y el hostname de API en las
plantillas; no copies ambos mapas a la vez.
