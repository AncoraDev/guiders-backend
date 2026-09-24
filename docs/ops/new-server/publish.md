# Publicar en este VPS

Cada aplicación del servidor es un checkout de `main`. Publicar es siempre el mismo proceso. GitHub Actions queda para más adelante.

1. En local: commit en `main` y push al remoto.
2. Entrar por SSH como `deploy` y, en el directorio de esa aplicación, `git pull --ff-only` y reiniciar lo que corresponda.

No se copian archivos al servidor (`rsync`, `scp`) ni se editan ahí el código ni los `.env`. Si `git pull` se queja de cambios locales, ese cambio tiene que estar ya en el repositorio. No se resuelve editando el servidor.

El usuario `deploy` usa la clave `~/.ssh/github_ed25519`. Tiene que estar registrada en la cuenta de GitHub **AncoraDev** (Settings → SSH and GPG keys). Sin eso, `git pull` no llega al remoto.

Host: `deploy@187.33.147.104`.

## Por aplicación

| Aplicación | Directorio | Después del pull |
|------------|------------|------------------|
| API | `/var/www/guiders-backend` | `npm run build` y `pm2 restart guiders-backend` |
| Área de proveedor | `/var/www/guiders-leadcars-demo` | `pm2 restart guiders-leadcars-demo` |
| Demo | `/var/www/guiders-sdk` | Nada. nginx sirve `demo/app` |
| Console y Admin | `/var/www/guiders-frontend-src` | Compilar y apuntar `current` a la release nueva |

La API ejecuta `dist/`. El pull solo actualiza el código fuente; sin `npm run build` el proceso sigue con la compilación anterior. La primera vez que falte el compilador: `npm ci` en ese directorio, sin borrar `.env.production`.

Console y Admin no los sirve PM2. nginx lee `/var/www/guiders-frontend/current`. Después del pull:

```bash
cd /var/www/guiders-frontend-src
npm run build:prod
REL=/var/www/guiders-frontend/releases/$(date +%Y%m%d%H%M%S)
mkdir -p "$REL"
cp -a dist/apps/console "$REL/console"
cp -a dist/apps/admin "$REL/admin"
ln -sfn "$REL" /var/www/guiders-frontend/current
```

La primera vez, `npm ci` en `/var/www/guiders-frontend-src`.

## Qué no forma parte de este proceso

- Sustituir `.env` o `.env.production`.
- `npm run typeorm:migrate:run` completo. Si hace falta un cambio de esquema, solo el `ALTER` o `CREATE TABLE` concreto.
- `git clean`, `git reset --hard` o un push con `--force`.
- Borrar `node_modules`, `dist` o las releases antiguas como parte del pull.
