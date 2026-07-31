# Informe de Auditoría DevSecOps — Guiders Backend

**Fecha**: 2026-04-21
**Alcance**: Repositorio `/Users/rogerpugaruiz/Proyectos/guiders-backend` (NestJS v11 + DDD/CQRS, PostgreSQL + MongoDB, Docker, GitHub Actions, PM2).
**Tipo**: Revisión estática de infraestructura, configuración, CI/CD, dependencias y manejo de secretos. No incluye pentest dinámico ni revisión de lógica de negocio.
**Metodología**: Lectura directa de artefactos (Dockerfile, docker-compose*, workflows, `src/main.ts`, `src/app.module.ts`, `.env`, `.gitignore`), `npm audit`, `git ls-files` / `git check-ignore`, grep dirigido por patrones de secretos.

## Resumen ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| CRÍTICA   | 5        |
| ALTA      | 10       |
| MEDIA     | 9        |
| BAJA      | 4        |
| **Total** | **28**   |

### Acciones inmediatas (antes de leer el resto)

1. **Revocar AHORA** las siguientes credenciales presentes en `.env` (filesystem local, ver INFRA-001):
   - AWS IAM Access Key `AKIAYKFQRE73CROWUFBP` → rotar en IAM Console.
   - Resend API Key `re_7Z9J8…` → revocar en dashboard Resend.
   - Groq API Key `gsk_WRHkcaEdH8Y…` → revocar en Groq console.
2. Rotar `ENCRYPTION_KEY` de producción y dejar de reutilizarla entre `.env` y `.env.test`.
3. Eliminar logs de secretos en `src/app.module.ts` (INFRA-006) — los valores actuales están en stdout / PM2 logs.
4. Bloquear `TYPEORM_SYNC=true` en producción a nivel de código, no solo de variable (INFRA-011).

---

## Hallazgos

### [CRÍTICA] INFRA-001 — Credenciales de producción reales en `.env` local

- **Archivo:línea**: `.env:26,29,48,54`
- **Descripción**: El archivo `.env` en el root del proyecto contiene claves activas de AWS IAM, Resend y Groq, además de `ENCRYPTION_KEY` y passwords de BD. Aunque `.gitignore:39` excluye `.env` y `git ls-files` confirma que **no está trackeado**, el archivo existe en disco con credenciales presumiblemente válidas y puede haberse enviado por canales no seguros (Slack, email, backups) o quedar en dumps de disco/snapshots de VM.
- **Impacto**: Compromiso total de bucket S3 `guiders-avatars-dev`, capacidad de enviar emails suplantando el dominio (Resend), consumo no autorizado de cuota LLM (Groq). Las claves AWS IAM sin MFA ni condiciones de IP permiten pivoting lateral dentro de la cuenta AWS si el usuario tiene políticas amplias.
- **Evidencia** (valores redactados):
  ```
  AWS_ACCESS_KEY_ID=AKIAYKFQRE73CROWUFBP
  AWS_SECRET_ACCESS_KEY=Iz+uNJpm…REDACTED…pGqt
  RESEND_API_KEY=re_7Z9J8Lby_…REDACTED
  GROQ_API_KEY=gsk_WRHkcaEdH8Y…REDACTED
  ENCRYPTION_KEY=<hex 64 chars>
  ```
- **Remediación**:
  1. Revocar las 3 claves inmediatamente en sus consolas respectivas.
  2. Auditar CloudTrail (AWS) y logs Resend/Groq por uso no autorizado en los últimos 90 días.
  3. Mover secretos a AWS Secrets Manager / HashiCorp Vault / GitHub Environments con OIDC (no static keys).
  4. Añadir `git-secrets` o `gitleaks` como pre-commit hook y en CI.
  5. Verificar historial git con `gitleaks detect --source . --log-opts="--all"` por si alguna vez se commiteó.
- **CVSS**: 9.8 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)
- **CWE**: CWE-798 (Hardcoded Credentials), CWE-312 (Cleartext Storage).

---

### [CRÍTICA] INFRA-002 — Password por defecto `'password'` para MongoDB de producción

- **Archivo:línea**: `scripts/mongo-init.js:12`
- **Descripción**: El script de inicialización de MongoDB (ejecutado por el contenedor al primer arranque) usa `process.env.MONGODB_PASSWORD || (environment === 'production' ? 'password' : 'admin')`. Si la variable no está seteada **en producción**, se crea el usuario `guiders_admin` con password literal `'password'`.
- **Impacto**: Acceso completo (readWrite + dbAdmin) a la base de datos MongoDB de producción si se despliega sin la variable o con un error de montaje de env. Compromete toda la información de conversaciones, visitantes y tracking.
- **Evidencia**:
  ```js
  const username = process.env.MONGODB_USERNAME || (environment === 'production' ? 'guiders_admin' : 'admin');
  const password = process.env.MONGODB_PASSWORD || (environment === 'production' ? 'password' : 'admin');
  ```
- **Remediación**: Eliminar los fallbacks en producción; si la variable no está presente, hacer `throw new Error('MONGODB_PASSWORD required')` y abortar el init.
- **CVSS**: 9.1 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L)
- **CWE**: CWE-1188 (Insecure Default Initialization), CWE-521 (Weak Password Requirements).

---

### [CRÍTICA] INFRA-003 — Secretos (ENCRYPTION_KEY, GLOBAL_TOKEN_SECRET, DB passwords) logueados en stdout

- **Archivo:línea**: `src/app.module.ts:247, 300-316`
- **Descripción**: Durante el bootstrap, la app imprime valores completos de secretos con `logger.log`. En producción con PM2 estos logs van a `/var/log/pm2/*-combined.log` con permisos usualmente 644 y sin rotación cifrada; también quedan en stdout del contenedor si se ejecuta en Docker (`docker logs`), accesibles por cualquier usuario con acceso a la VM o al daemon docker.
- **Impacto**: Cualquier atacante con lectura de logs (operador, SRE, breach en syslog remoto, Sentry/Datadog forwarders, contenedor sidecar de logs) obtiene `ENCRYPTION_KEY` (compromete cifrado at-rest), `GLOBAL_TOKEN_SECRET` (forja JWT) y passwords de BD.
- **Evidencia**:
  ```ts
  // L300
  logger.log(`ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY}`);
  logger.log(`GLOBAL_TOKEN_SECRET: ${process.env.GLOBAL_TOKEN_SECRET}`);
  // L305
  logger.log(`DATABASE_PASSWORD: ${process.env.DATABASE_PASSWORD}`);
  // L311
  if (process.env.MONGODB_PASSWORD) logger.log(`MONGODB_PASSWORD: ${process.env.MONGODB_PASSWORD}`);
  ```
- **Remediación**:
  1. Eliminar todos los `logger.log` que impriman secretos.
  2. Reemplazar por presence-check: `logger.log('ENCRYPTION_KEY: [SET]')` si está definido, o por su longitud.
  3. Añadir regla ESLint custom `no-secret-log` que prohíba tokens `password|secret|key|token` dentro de template strings en llamadas de logger.
  4. Rotar TODOS los secretos que hayan pasado por estos logs.
- **CVSS**: 8.8 (AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N) — sube a 9.3 si los logs se reenvían a SaaS externo.
- **CWE**: CWE-532 (Insertion of Sensitive Information into Log File), CWE-200.

---

### [CRÍTICA] INFRA-004 — `ENCRYPTION_KEY` reutilizada entre `.env` y `.env.test` (y hardcodeada en CI)

- **Archivo:línea**: `.env`, `.env.test`, `.github/workflows/ci.yml:427,721,769`, `deploy-staging.yml:205,258`, `deploy-main.yml:203,256`
- **Descripción**: La misma `ENCRYPTION_KEY` hex de 64 caracteres está presente en el `.env` del desarrollador y también en `.env.test` (trackeado en git). Además, los workflows de CI/CD hardcodean una key específica `a1b2c3d4…a1b2` como patrón repetible. Si alguien usó la clave de `.env.test` (que está en GitHub) en producción, los datos cifrados son descifrables por cualquiera que clone el repo.
- **Impacto**: Datos cifrados en BD (campos sensibles de visitantes, tokens OAuth, posibles PII) descifrables con la clave pública del repo.
- **Evidencia**: `git ls-files | grep env` → `.env.test` está trackeado.
- **Remediación**:
  1. Auditar qué valores están cifrados con esa key en producción y re-cifrarlos con una nueva.
  2. Cambiar `.env.test` a usar una clave ficticia claramente marcada (`0000…0000`) y distinta de cualquier entorno real.
  3. Generar `ENCRYPTION_KEY` en CI con `openssl rand -hex 32` por run.
- **CVSS**: 8.1 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N)
- **CWE**: CWE-798, CWE-321 (Use of Hard-coded Cryptographic Key).

---

### [CRÍTICA] INFRA-005 — `GLOBAL_TOKEN_SECRET` con valor placeholder en `.env`

- **Archivo:línea**: `.env:~54` (`GLOBAL_TOKEN_SECRET=your_global_token_secret_here`)
- **Descripción**: La variable que firma los JWT globales contiene el literal `your_global_token_secret_here` (string predecible). `src/app.module.ts:57` usa `secret: process.env.GLOBAL_TOKEN_SECRET` sin validar longitud ni entropía.
- **Impacto**: Cualquiera puede forjar JWT válidos firmados con ese secret (está en cualquier plantilla pública de NestJS) y autenticarse como cualquier usuario.
- **Evidencia**: `GLOBAL_TOKEN_SECRET=your_global_token_secret_here`
- **Remediación**: Generar con `openssl rand -base64 64`, exigir mínimo 32 bytes de entropía en `ConfigModule.forRoot({ validationSchema })` y **fail-fast** si no se cumple.
- **CVSS**: 9.8 (si este `.env` se usa en un entorno accesible)
- **CWE**: CWE-521, CWE-798.

---

### [ALTA] INFRA-006 — Helmet ausente; headers de seguridad HTTP no configurados

- **Archivo:línea**: `src/main.ts` (no aparece `helmet` ni equivalente)
- **Descripción**: No se registra Helmet ni middleware manual para CSP, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy, Permissions-Policy.
- **Impacto**: Clickjacking, MIME-sniffing, downgrade a HTTP, fuga de Referer a terceros.
- **Evidencia**: Grep de `helmet` en `src/` → 0 matches.
- **Remediación**:
  ```ts
  import helmet from 'helmet';
  app.use(helmet({
    contentSecurityPolicy: { /* directivas específicas */ },
    crossOriginEmbedderPolicy: false, // ajustar según front
  }));
  ```
- **CVSS**: 6.5
- **CWE**: CWE-693 (Protection Mechanism Failure), CWE-1021 (Improper Restriction of Rendered UI Layers).

---

### [ALTA] INFRA-007 — Fallbacks de secrets débiles en cookie-parser y session

- **Archivo:línea**: `src/main.ts:51, 105`
- **Descripción**:
  ```ts
  app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-secret'));
  app.use(session({ secret: process.env.SESSION_SECRET || 'dev-session', … }));
  ```
  Si las variables no están seteadas en producción, se firma/encripta con strings predecibles públicos.
- **Impacto**: Forja de cookies firmadas, session fixation, elevación de privilegios.
- **Remediación**: Quitar el fallback y hacer `throw new Error('COOKIE_SECRET required')` en arranque cuando `NODE_ENV === 'production'`.
- **CVSS**: 7.5
- **CWE**: CWE-798, CWE-384 (Session Fixation).

---

### [ALTA] INFRA-008 — Dockerfile copia `.env.production` a la imagen

- **Archivo:línea**: `Dockerfile:33` (aprox — verificar en workspace)
- **Descripción**: `COPY .env.production ./` introduce secretos directamente en un layer de la imagen. Cualquiera con `docker pull` o acceso al registry los extrae con `docker history` o `docker save | tar`.
- **Impacto**: Fuga de todos los secretos de producción a cualquiera con pull sobre el registry (GHCR, ECR).
- **Remediación**: Usar `--env-file` en runtime, Docker Secrets, o inyección por orquestador (ECS task definition, K8s Secret, Docker Swarm secret). **Nunca** meter `.env*` en la imagen.
- **CVSS**: 8.6
- **CWE**: CWE-538 (File and Directory Information Exposure), CWE-312.

---

### [ALTA] INFRA-009 — Dockerfile corre como root y usa Node 18 (EOL)

- **Archivo:línea**: `Dockerfile:1,~` 
- **Descripción**: Base `node:18-slim`. Node 18 entró en Maintenance LTS en oct-2024 y **EOL el 30 abr 2025** — sin parches de seguridad. No hay directiva `USER node` ni creación de usuario no privilegiado; el proceso corre como UID 0 dentro del contenedor.
- **Impacto**: (1) Vulnerabilidades no parcheadas en runtime. (2) Si un atacante logra RCE en la app (ej. via INFRA-012 DoS o deserialización), tiene root en el contenedor y puede escapar con CVEs de runc/containerd recientes con mayor superficie.
- **Remediación**:
  ```Dockerfile
  FROM node:22-slim
  RUN groupadd -r app && useradd -r -g app app
  USER app
  HEALTHCHECK --interval=30s --timeout=5s CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode===200?0:1))"
  ```
- **CVSS**: 7.2
- **CWE**: CWE-250 (Execution with Unnecessary Privileges), CWE-1104 (Use of Unmaintained Third Party Components).

---

### [ALTA] INFRA-010 — Puertos de bases de datos expuestos en 0.0.0.0

- **Archivo:línea**: `docker-compose.yml`, `docker-compose-prod.yml`, `docker-compose-staging.yml`
- **Descripción**: Servicios mapean puertos con notación corta (`"5432:5432"`, `"27017:27017"`, `"6379:6379"`, `"5434:5432"`, Keycloak `"8080:8080"`). En sintaxis corta, Docker los publica en **todas las interfaces (0.0.0.0)**, incluyendo la IP pública de la VM.
- **Impacto**: Superficie directa a internet sobre Postgres (5432), MongoDB (27017), Redis (6379) y Keycloak (8080). Combinado con passwords débiles de INFRA-002 e INFRA-017, exposición crítica.
- **Remediación**: Forzar bind local: `"127.0.0.1:5432:5432"`. Las BD sólo deben ser accesibles desde la red docker interna (sin `ports:`) o vía bastion/WireGuard.
- **CVSS**: 8.2
- **CWE**: CWE-668 (Exposure of Resource to Wrong Sphere).

---

### [ALTA] INFRA-011 — `TYPEORM_SYNCHRONIZE` controlable por variable en staging/prod

- **Archivo:línea**: `src/app.module.ts:176`, `src/data-source.ts:38,83`, `.github/workflows/deploy-staging.yml` (var `TYPEORM_SYNC`)
- **Descripción**:
  ```ts
  const allowSync = process.env.TYPEORM_SYNC === 'true';
  synchronize: allowSync || isE2ETest
  ```
  No hay guard por `NODE_ENV`. Basta con que una variable se cuele en producción para que TypeORM haga `DROP/ALTER` automáticos al arrancar.
- **Impacto**: Pérdida de datos, downtime, corrupción de schema.
- **Remediación**:
  ```ts
  const allowSync = process.env.TYPEORM_SYNC === 'true' && process.env.NODE_ENV !== 'production';
  ```
  Además, los workflows no deben exponer esa var como `vars` editable desde UI en environments de producción.
- **CVSS**: 7.5
- **CWE**: CWE-16 (Configuration), CWE-15 (External Control of System or Configuration Setting).

---

### [ALTA] INFRA-012 — Dependencias NPM con 4 vulnerabilidades HIGH

- **Archivo:línea**: `package-lock.json`
- **Descripción**: `npm audit` reporta 25 vulns (6 low / 15 moderate / **4 high**):
  - `@nestjs/microservices` → GHSA-hpwf-8g29-85qm (DoS via `JsonSocket.handleData`, CVSS 7.5).
  - `@nestjs/config` → prototype pollution y code injection vía `lodash` (GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc).
  - `@nestjs/swagger` → mismas cadenas lodash.
  - `nodemailer <= 8.0.4` → SMTP command injection (GHSA-c7w3-x93f-qmm8).
  - `follow-redirects` → leak de `Authorization` header al redirigir (GHSA-r4q5-vmmm-2653).
- **Impacto**: DoS remoto del microservicio TCP; si se usa lodash dinámicamente con input del usuario, RCE posible.
- **Remediación**: `npm audit fix`; si aún quedan, ver `npm audit fix --force` sólo tras leer breaking changes. Añadir `npm audit --audit-level=high` como gate de merge bloqueante (no solo informativo) y `osv-scanner` en CI.
- **CVSS**: hasta 7.5 individual
- **CWE**: CWE-400, CWE-1321 (Prototype Pollution), CWE-94, CWE-522.

---

### [ALTA] INFRA-013 — GitHub Actions sin `permissions:` y sin pin por SHA

- **Archivo:línea**: `.github/workflows/ci.yml`, `deploy-staging.yml`, `deploy-main.yml`
- **Descripción**: Ningún workflow declara `permissions:` a nivel top o job, por lo que `GITHUB_TOKEN` hereda el default del repo (frecuentemente `read-write` a contents y packages). Third-party actions se referencian por tag móvil: `actions/checkout@v4`, `actions/cache@v4`, `nick-fields/retry@v3`.
- **Impacto**: Si una action es comprometida (supply-chain, como tj-actions/changed-files en 2025) o el tag se reapunta a un commit malicioso, el atacante obtiene `GITHUB_TOKEN` con permisos amplios y puede push a `main`, publicar releases, modificar secrets.
- **Remediación**:
  ```yaml
  permissions:
    contents: read
  jobs:
    build:
      permissions:
        contents: read
      steps:
        - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
  ```
  Usar `dependabot` con `package-ecosystem: github-actions` o la herramienta `pin-github-action`.
- **CVSS**: 7.4
- **CWE**: CWE-829 (Inclusion of Functionality from Untrusted Source), CWE-1357.

---

### [ALTA] INFRA-014 — Despliegue SSH con `sshpass` y `StrictHostKeyChecking=no`

- **Archivo:línea**: `.github/workflows/deploy-staging.yml`, `deploy-main.yml`
- **Descripción**: Los jobs de deploy usan `sshpass -p "$SSH_PASSWORD"` en lugar de claves SSH; `ssh-keyscan` se usa sin verificar fingerprint y se aplica `StrictHostKeyChecking=no`. Además, la clave pública de WireGuard y el endpoint `217.154.105.26:51820` están hardcodeados en el workflow.
- **Impacto**: MITM en el primer handshake SSH; si el secret `SSH_PASSWORD` se filtra por logs (por error de `set -x`), el atacante tiene acceso root al servidor. El endpoint WireGuard expuesto permite escaneo dirigido.
- **Remediación**:
  1. Cambiar a SSH keys (ED25519) con passphrase gestionada por Actions.
  2. Subir `known_hosts` fijo al repo y montarlo en el runner.
  3. Mover endpoints de red a secrets, no variables del workflow.
  4. Considerar `webfactory/ssh-agent@…` pinned por SHA.
- **CVSS**: 7.8
- **CWE**: CWE-295 (Improper Certificate Validation), CWE-322 (Key Exchange without Authentication), CWE-798.

---

### [ALTA] INFRA-015 — Keycloak en producción con `start-dev` y `KC_HOSTNAME_STRICT: false`

- **Archivo:línea**: `docker-compose-prod.yml:~132`
- **Descripción**: El servicio Keycloak de producción usa `command: start-dev` (modo desarrollo: sin cache, sin TLS obligatorio, relajaciones múltiples) y `KC_HOSTNAME_STRICT: false` (acepta cualquier Host header → host-header injection → enlaces de reset de password dirigidos a dominios controlados).
- **Impacto**: Takeover de cuentas vía password-reset con Host header manipulado; falta de optimizaciones de seguridad del modo producción.
- **Remediación**: Cambiar a `command: start --optimized`, con `KC_HOSTNAME_STRICT=true`, `KC_HOSTNAME=login.guiders.es`, `KC_PROXY=edge` y TLS terminado en el reverse proxy.
- **CVSS**: 7.4
- **CWE**: CWE-20, CWE-644 (Improper Neutralization of HTTP Headers for Scripting Syntax).

---

### [MEDIA] INFRA-016 — `ConfigModule` sin `validationSchema`

- **Archivo:línea**: `src/app.module.ts:~50` (`ConfigModule.forRoot({ isGlobal: true })`)
- **Descripción**: No hay validación Joi/Zod de variables requeridas (`DATABASE_URL`, `ENCRYPTION_KEY`, `GLOBAL_TOKEN_SECRET`, `NODE_ENV`). La app arranca con `undefined` en claves críticas y falla en runtime.
- **Impacto**: Fallos sutiles (JWT firmado con `undefined` tratado como string), difícil de diagnosticar; permite que llegue a prod una config incompleta.
- **Remediación**:
  ```ts
  ConfigModule.forRoot({
    isGlobal: true,
    validationSchema: Joi.object({
      NODE_ENV: Joi.string().valid('development','staging','production','test').required(),
      GLOBAL_TOKEN_SECRET: Joi.string().min(32).required(),
      ENCRYPTION_KEY: Joi.string().length(64).hex().required(),
      DATABASE_PASSWORD: Joi.string().min(12).required(),
      // ...
    }),
    validationOptions: { abortEarly: true },
  });
  ```
- **CVSS**: 5.3
- **CWE**: CWE-20.

---

### [MEDIA] INFRA-017 — Passwords débiles hardcodeados en docker-compose

- **Archivo:línea**: `docker-compose.yml`, `docker-compose-staging.yml`, `docker-compose-prod.yml:74`
- **Descripción**: Servicios auxiliares tienen credenciales triviales: `postgres/postgres`, `admin/admin123`, `keycloak/keycloak`, `mongo admin/password`, Adminer/Mongo-Express/Redis-Commander con `staging123`. En prod, `MONGO_INITDB_ROOT_USERNAME: admin` hardcodeado.
- **Impacto**: Si los puertos se exponen (INFRA-010), compromiso inmediato por diccionario.
- **Remediación**: Generar passwords random por entorno, inyectar via `env_file` con archivo fuera del repo; nunca hardcodear usernames/passwords en YAML versionado.
- **CVSS**: 6.4 (condicional a INFRA-010)
- **CWE**: CWE-798, CWE-521.

---

### [MEDIA] INFRA-018 — `.gitignore` incompleto para artefactos sensibles

- **Archivo:línea**: `.gitignore`
- **Descripción**: No excluye `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `.env.*.local`, `.env.staging`, `credentials*.json`, `*.kubeconfig`, `terraform.tfstate*`.
- **Impacto**: Riesgo de commit accidental de certificados, claves privadas, kubeconfigs.
- **Remediación**: Añadir patrones anteriores al `.gitignore` y configurar `git config --global core.excludesFile ~/.gitignore_global` en docs de onboarding. Instalar `gitleaks` pre-commit.
- **CVSS**: 5.5
- **CWE**: CWE-538.

---

### [MEDIA] INFRA-019 — CORS `origin: true` en entornos dev-like

- **Archivo:línea**: `src/main.ts:~204`
- **Descripción**: En `isDevLike` (incluye `staging` según la expresión), CORS responde con `Access-Control-Allow-Origin` reflejando cualquier Origin y `credentials: true`.
- **Impacto**: CSRF con cookies en staging; si staging tiene datos reales clonados, exposición.
- **Remediación**: Lista explícita de orígenes incluso en staging: `origin: ['https://staging.guiders.es']`.
- **CVSS**: 5.4
- **CWE**: CWE-942 (Permissive Cross-domain Policy), CWE-346.

---

### [MEDIA] INFRA-020 — `npm install --legacy-peer-deps` en Dockerfile

- **Archivo:línea**: `Dockerfile` (paso de instalación)
- **Descripción**: Uso de `npm install` (no `npm ci`) con `--legacy-peer-deps` oculta incompatibilidades de peer deps y permite resoluciones no reproducibles respecto al `package-lock.json`.
- **Impacto**: Build no determinista, posibles versiones vulnerables distintas a las auditadas.
- **Remediación**: `npm ci --omit=dev` (si se necesitan overrides de peer deps, declararlos en `overrides` de `package.json`).
- **CVSS**: 4.3
- **CWE**: CWE-1357, CWE-494.

---

### [MEDIA] INFRA-021 — Workflows exponen passwords como plain text args a `sshpass`

- **Archivo:línea**: `deploy-staging.yml`, `deploy-main.yml`
- **Descripción**: `sshpass -p "$SSH_PASSWORD"` pasa el password como argumento de línea de comandos visible en `ps` del runner. Si otro step ejecuta `ps aux`, lo captura.
- **Impacto**: Fuga lateral de password en logs parciales de debugging.
- **Remediación**: Usar `sshpass -e` (variable de entorno) o preferiblemente SSH keys.
- **CVSS**: 5.0
- **CWE**: CWE-214 (Invocation of Process Using Visible Sensitive Information).

---

### [MEDIA] INFRA-022 — `rollback-deploy.js` ejecuta `rm -rf` y `mv` sin lock ni confirmación

- **Archivo:línea**: `bin/rollback-deploy.js:32,35,36`
- **Descripción**: Script destructivo que hace `rm -rf ${tempPath}` y dos `mv` de directorios enteros en `/var/www/` sin verificar que no hay deploy concurrente, sin `flock`, sin prompt de confirmación.
- **Impacto**: Race condition con despliegue en curso → corrupción de estado; errores tipográficos en env vars futuras podrían apuntar `tempPath` a ubicación crítica.
- **Remediación**: Añadir `flock /tmp/guiders-deploy.lock -w 30`, validación `require('path').resolve(tempPath).startsWith('/var/www/')` antes de cualquier `rm`, y flag `--confirm` obligatorio.
- **CVSS**: 5.5
- **CWE**: CWE-362 (Race Condition), CWE-20.

---

### [MEDIA] INFRA-023 — `trust proxy` = 1 sin validar cadena de proxies

- **Archivo:línea**: `src/main.ts:226` (`app.set('trust proxy', 1)`)
- **Descripción**: Confía en un único hop. Si el deployment pasa por más de un reverse proxy (CDN + Nginx, por ejemplo) o si se cambia la topología sin actualizar el código, `req.ip` se puede spoofear con `X-Forwarded-For`.
- **Impacto**: Bypass de rate-limiters basados en IP, logs de auditoría incorrectos.
- **Remediación**: Usar lista de CIDR confiables: `app.set('trust proxy', ['10.0.0.0/8', '172.16.0.0/12'])` según topología real; documentar la cadena.
- **CVSS**: 5.3
- **CWE**: CWE-348 (Use of Less Trusted Source).

---

### [MEDIA] INFRA-024 — `app.listen(PORT, '0.0.0.0')` expone directamente la app

- **Archivo:línea**: `src/main.ts:240`
- **Descripción**: Escucha en todas las interfaces. Es necesario en contenedores, pero combinado con INFRA-010 (puertos publicados en 0.0.0.0 en Docker) y la ausencia de firewall explícito, la app es accesible directo sin pasar por el reverse proxy.
- **Impacto**: Bypass de WAF/rate-limits del proxy si el puerto 3000 queda expuesto.
- **Remediación**: En despliegue bare-metal/PM2, escuchar en `127.0.0.1` y poner Nginx delante. En Docker, mantener 0.0.0.0 pero no publicar el puerto al host (sólo red interna).
- **CVSS**: 4.8
- **CWE**: CWE-668.

---

### [BAJA] INFRA-025 — `docker-compose version: '3.8'` obsoleta

- **Archivo:línea**: `docker-compose.yml:1`
- **Descripción**: Compose v2 (CLI moderno) ignora la directiva `version:` y ha marcado `3.x` como obsoleta.
- **Impacto**: Cosmético; warnings en CI.
- **Remediación**: Eliminar la línea `version:` y verificar con `docker compose config`.
- **CVSS**: 0
- **CWE**: N/A.

---

### [BAJA] INFRA-026 — `bin/guiders-cli.js` registra `ts-node` en runtime

- **Archivo:línea**: `bin/guiders-cli.js`
- **Descripción**: Registrar `ts-node/register` en producción tiene overhead de arranque y expone dependencias dev en el contenedor de prod si llega a distribuirse.
- **Impacto**: Superficie de ataque ampliada, tiempo de arranque mayor.
- **Remediación**: Compilar el CLI con `tsc` al build y distribuir el `.js` final; mover `ts-node` a `devDependencies`.
- **CVSS**: 2.5
- **CWE**: CWE-1041.

---

### [BAJA] INFRA-027 — Migraciones sin verificación de idempotencia documentada

- **Archivo:línea**: `src/migrations/*.ts` (13 archivos)
- **Descripción**: No se detectaron seeds con passwords ni PII (✅ positivo), pero tampoco se observan tests de migración reversible (`down()`). Varias migraciones `auto-migration-*` sugieren uso de `synchronize` histórico.
- **Impacto**: Rollback no verificado → riesgo operacional.
- **Remediación**: Añadir test de migración en CI: aplicar `up` → `down` → `up` sobre DB de prueba y verificar integridad.
- **CVSS**: 2.0
- **CWE**: CWE-710.

---

### [BAJA] INFRA-028 — `package.json` start:prod sin flags de hardening Node

- **Archivo:línea**: `package.json` (`"start:prod": "node dist/src/main"`)
- **Descripción**: Sin `--disallow-code-generation-from-strings`, sin `--no-deprecation` control, sin límite de heap explícito.
- **Impacto**: Mitigaciones opcionales no activadas.
- **Remediación**: `node --disallow-code-generation-from-strings --max-old-space-size=1024 dist/src/main.js`.
- **CVSS**: 2.0
- **CWE**: CWE-693.

---

## Matriz de priorización

| Prioridad | Hallazgos | Plazo sugerido |
|-----------|-----------|----------------|
| P0 — Inmediato (24h) | INFRA-001, 002, 003, 005 | Revocar + rotar |
| P1 — Semana 1 | INFRA-004, 006, 007, 008, 011, 012, 014, 015 | Parche y despliegue |
| P2 — Sprint actual | INFRA-009, 010, 013, 016, 017, 018, 019, 020, 021, 022 | Plan de hardening |
| P3 — Backlog | INFRA-023 a 028 | Mejora continua |

## Recomendaciones transversales

1. **Gestión de secretos**: adoptar AWS Secrets Manager o Doppler; GitHub OIDC → AWS assume-role (elimina static keys).
2. **Supply chain**: `gitleaks` + `osv-scanner` + `trivy fs .` + `trivy image` en CI como gates bloqueantes.
3. **SAST**: añadir `semgrep --config=p/owasp-top-ten --config=p/nestjs` en PRs.
4. **SBOM**: generar `cyclonedx-npm` en releases.
5. **Runtime**: plantear migración a Kubernetes con NetworkPolicies o endurecer docker-compose con redes internas sin `ports:` expuestos.
6. **Observabilidad**: centralizar logs con masking automático de patrones `password|secret|token|key` antes de shipping.

---

**Generado por**: auditoría estática automatizada con revisión manual dirigida.
**Siguiente paso recomendado**: aprobar el plan P0/P1 y abrir issues por cada ID en el tracker.
