# Primera puesta en marcha (checklist)

Ejecuta en este orden. Detalle de cada paso: [README.md](./README.md).

Sustituye `__DOMAIN__` por tu dominio. La rama `sergi-version-v1` no despliega;
usa merge a `main` o `workflow_dispatch`.

- [x] DNS Console + Admin: `guiders-console.ancoradual.com` y `guiders-admin.ancoradual.com` → `187.33.147.104`
- [x] DNS API + Auth: `guiders-api.ancoradual.com` y `guiders-auth.ancoradual.com` → `187.33.147.104`
- [x] Bootstrap VPS (2026-09-23): Docker, Node 20, PM2, nginx, `deploy`, swap 2 GB ([this-vps.md](./this-vps.md))
- [x] `.env.production` en el server (`chmod 600`) — 23/09, secretos nuevos (no local)
- [x] Docker infra (23/09): postgres, mongodb, redis, keycloak (+ su postgres). Compose: `docker-compose.vps.yml`.
- [ ] Secrets GitHub ([secrets.md](./secrets.md))
- [x] Keycloak realm `guiders` + clients `console`/`admin` (23/09)
- [x] nginx + certbot de los 4 hosts (23/09)
- [x] Backend en PM2 (23/09, deploy manual; no GitHub Actions todavía)
- [x] `environment.prod.ts` Console/Admin → ancoradual.com (23/09)
- [x] Frontend en `current` (23/09, rsync manual)
- [ ] Login Console / Admin (mismos usuarios que en local)
- [x] Demo pixel: `https://guiders-demo.ancoradual.com` → API `guiders-api.ancoradual.com` (23/09)
