# Bootstrap del VPS (una vez, a mano)

VPS actual: **`187.33.147.104`**, Ubuntu 26.04, 1 vCPU / 4 GB / 10 GB.
Atajo: [bootstrap.sh](./bootstrap.sh) como root. Detalle de esta máquina:
[this-vps.md](./this-vps.md).

Ubuntu 22.04+ con IP pública. No reutilices VPN, secrets ni claves del
servidor anterior.

## 1. Usuario deploy y SSH

```bash
# como root
adduser deploy
usermod -aG sudo,docker deploy   # docker group tras instalar Docker
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
# pega la clave pública del CI o de tu laptop:
# echo 'ssh-ed25519 AAAA...' >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

En GitHub Actions el workflow actual usa `sshpass` + `PROD_SSH_PASSWORD`.
En un server nuevo es más seguro una **deploy key** (solo lectura de repos no
aplica aquí: es SSH al VPS). Si te quedas con contraseña, usa una larga y
desactiva password auth cuando el CI ya use clave.

`/etc/ssh/sshd_config` recomendado el primer día:

```
PasswordAuthentication yes    # o no, si ya tienes clave en CI
PermitRootLogin no
PubkeyAuthentication yes
```

## 2. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Keycloak, Postgres, Mongo, Redis: SOLO localhost. No abras 8080/5432/27017/6379.
sudo ufw enable
sudo ufw status
```

WireGuard (opcional, más adelante): UDP 51820 solo si montas VPN. El primer
día **no hace falta**.

## 3. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# cierra sesión y vuelve a entrar
docker --version
docker compose version
```

## 4. Node 20 y PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
node -v   # v20.x
pm2 -v
```

Arranque en boot (como `deploy`):

```bash
pm2 startup systemd -u deploy --hp /home/deploy
# ejecuta la línea que imprime pm2 (sudo env PATH=...)
# pm2 save se hace DESPUÉS del primer `pm2 start ecosystem.config.js`
```

## 5. nginx + certbot

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot
```

Sitios: [dns-and-nginx.md](./dns-and-nginx.md). No pidas certificados hasta
que el DNS resuelva.

## 6. Directorios

```bash
sudo mkdir -p /var/www/guiders-backend
sudo mkdir -p /var/www/guiders-frontend/releases
sudo mkdir -p /var/www/guiders-frontend/current
sudo chown -R deploy:deploy /var/www/guiders-backend /var/www/guiders-frontend
```

El workflow de frontend usa `STAGING_DEPLOY_PATH` (nombre histórico) y sube
el build **production** a ese path. Pon el mismo valor en el secret, p. ej.
`/var/www/guiders-frontend`.

Staging real (opcional, otro compose) iría en `/var/www/guiders-backend-staging/`.
Para el primer servidor puedes omitirlo.

Copia inicial del compose (una vez, antes del primer deploy de CI):

```bash
# desde tu laptop, con el repo clonado
rsync -a docker/ deploy@api.__DOMAIN__:/var/www/guiders-backend/docker/
# y el .env.production (nunca por git)
scp env.production deploy@api.__DOMAIN__:/var/www/guiders-backend/.env.production
chmod 600  # en el server
```

O deja que el primer job de `deploy-main.yml` suba `docker/docker-compose.yml`
junto al tarball.

## 7. Acceso CI: SSH directo vs WireGuard

| Opción | Cuándo | Secrets |
|--------|--------|---------|
| SSH a IP/hostname público | Primer día (recomendado) | `PROD_HOST` = FQDN o IP; deja `WG_PRIVATE_KEY` vacío |
| WireGuard `10.0.0.0/24` | Cuando quieras que el VPS no tenga SSH en internet | `WG_PRIVATE_KEY`, `WG_SERVER_ENDPOINT`; `PROD_HOST` = IP VPN (`10.0.0.x`) |

El job de prod **omite** WireGuard si `WG_PRIVATE_KEY` está vacío. El de
frontend hace lo mismo y no exige ping a `10.0.0.1`.

## 8. Checklist rápido

- [ ] `deploy` en grupos `sudo` y `docker`
- [ ] SSH funciona desde tu máquina (`ssh deploy@<IP>`)
- [ ] Docker + compose OK
- [ ] Node 20 + PM2 globales
- [ ] `/var/www/guiders-backend` y `/var/www/guiders-frontend` existen
- [ ] ufw 22/80/443; DBs no expuestas
- [ ] nginx instalado; sitios aún no, o solo HTTP hasta certbot
- [ ] `.env.production` en el server con `chmod 600`
- [ ] GitHub secrets listos ([secrets.md](./secrets.md))
