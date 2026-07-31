# 🔐 Configuración Rápida de Secrets para Versiones de Consentimiento

## 🚀 Opción 1: Script Automático (Recomendado)

### Con GitHub CLI instalado

```bash
# Ejecutar el script interactivo
./scripts/setup-consent-secrets.sh

# El script te pedirá:
# 📝 Versión para STAGING [v1.4.0]: v1.4.0
# 📝 Versión para PRODUCCIÓN [v1.4.0]: v1.4.0
# ¿Proceder con esta configuración? [Y/n]: Y

# ✅ Configurará automáticamente ambos secrets
```

### Sin GitHub CLI

El script te mostrará las instrucciones exactas para configurar manualmente en GitHub.

---

## 📝 Opción 2: Configuración Manual

### Paso 1: Ir a GitHub

Ve a: `https://github.com/[TU_USUARIO]/guiders-backend/settings/secrets/actions`

### Paso 2: Crear Secrets

**Secret 1: Staging**
```
Nombre: STAGING_CONSENT_VERSION
Valor:  v1.4.0
```

**Secret 2: Producción**
```
Nombre: PROD_CONSENT_VERSION
Valor:  v1.4.0
```

---

## 🎯 Opción 3: GitHub CLI (Una Línea)

```bash
# Configurar staging
gh secret set STAGING_CONSENT_VERSION -b"v1.4.0"

# Configurar producción
gh secret set PROD_CONSENT_VERSION -b"v1.4.0"
```

---

## ✅ Verificación

### Listar secrets configurados

```bash
gh secret list
```

**Output esperado:**
```
STAGING_CONSENT_VERSION   Updated 2024-10-15
PROD_CONSENT_VERSION      Updated 2024-10-15
```

### Probar con deployment

```bash
# Deploy a staging
git commit --allow-empty -m "test: verificar consent version"
git push origin develop

# Revisar logs en:
# https://github.com/[TU_USUARIO]/guiders-backend/actions
```

---

## 📚 Documentación Completa

| Documento | Descripción |
|-----------|-------------|
| **docs/SETUP_GITHUB_SECRETS_STEP_BY_STEP.md** | 📖 Guía visual paso a paso |
| **docs/GITHUB_SECRETS_CONSENT_VERSION.md** | 🔧 Documentación técnica completa |
| **docs/CONSENT_VERSION_MANAGEMENT.md** | 📊 Gestión de versiones |

---

## 🆘 Problemas Comunes

### Error: "gh: command not found"

**Solución:** Instala GitHub CLI

```bash
# macOS
brew install gh

# Ubuntu/Debian
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Login
gh auth login
```

### Error: "HTTP 403: Resource not accessible by integration"

**Causa:** No tienes permisos de admin en el repositorio

**Solución:**
1. Pide al admin que te dé permisos
2. O pide que configure los secrets por ti

### Secret no se aplica en deployment

**Solución:** Fuerza nuevo deployment

```bash
git commit --allow-empty -m "force workflow re-run"
git push
```

---

## 🎯 Valores Recomendados

### Configuración Simple (Misma versión en todos)

```bash
STAGING_CONSENT_VERSION=v1.4.0
PROD_CONSENT_VERSION=v1.4.0
```

### Configuración con Testing (Staging diferente)

```bash
STAGING_CONSENT_VERSION=v1.5.0  # Testing nueva versión
PROD_CONSENT_VERSION=v1.4.0     # Versión estable
```

---

## 🔄 Actualizar Versión

### Método 1: Con GitHub CLI

```bash
# Actualizar staging a v1.5.0
gh secret set STAGING_CONSENT_VERSION -b"v1.5.0"

# Actualizar producción a v1.5.0
gh secret set PROD_CONSENT_VERSION -b"v1.5.0"
```

### Método 2: En la Web UI

1. Ve a: Settings → Secrets → Actions
2. Encuentra el secret
3. Clic en **Update**
4. Cambia el valor
5. Clic en **Update secret**

---

**¡Listo!** 🎉 Tus secrets están configurados.

Para más detalles, consulta la documentación completa en `docs/`.
