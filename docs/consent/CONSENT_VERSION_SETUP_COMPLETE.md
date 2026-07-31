# ✅ Configuración de Versiones de Consentimiento - COMPLETADA

## 📊 Resumen de lo Implementado

### 🏗️ Arquitectura Centralizada

Se ha implementado un sistema centralizado para gestionar versiones de consentimiento con las siguientes mejoras:

#### 1. Configuración Centralizada
**Archivo:** `src/context/consent/domain/config/consent-version.config.ts`

```typescript
// Versión por defecto (puede sobrescribirse con ENV)
export const DEFAULT_CONSENT_VERSION = 'v1.4.0';

// Whitelist opcional (vacía = acepta todas las versiones semánticas)
export const ALLOWED_CONSENT_VERSIONS: string[] = [];

// Funciones helper
getCurrentConsentVersion()    // Lee ENV o usa default
isConsentVersionAllowed(v)    // Valida versión
getConsentVersionErrorMessage(v) // Mensaje de error
```

**Ventajas:**
- ✅ Un solo lugar para actualizar versiones
- ✅ Control por entorno via ENV
- ✅ Modo flexible o estricto (whitelist)
- ✅ Validación automática de formato

#### 2. Integración con Código

**Archivos actualizados:**
- `ConsentVersion` - Usa configuración centralizada
- `IdentifyVisitorCommandHandler` - Usa `getCurrentConsentVersion()`
- `IdentifyVisitorDto` - Documentación Swagger dinámica

#### 3. GitHub Actions Workflows

**Modificados:**
- `.github/workflows/deploy-staging.yml` (línea 495)
- `.github/workflows/deploy-production.yml` (línea 94)

**Configuración agregada:**
```yaml
# Staging
CONSENT_VERSION_CURRENT=${{ secrets.STAGING_CONSENT_VERSION || 'v1.4.0' }}

# Producción
CONSENT_VERSION_CURRENT=${{ secrets.PROD_CONSENT_VERSION || 'v1.4.0' }}
```

---

## 🔑 GitHub Secrets Configurados

### ✅ Secrets Activos

```
✅ STAGING_CONSENT_VERSION   → v1.4.0 (configurado: 2025-10-15 09:01:15)
✅ PROD_CONSENT_VERSION       → v1.4.0 (configurado: 2025-10-15 09:01:26)
```

### 📝 Cómo Actualizar

**Método 1: GitHub CLI (Recomendado)**
```bash
# Actualizar staging
gh secret set STAGING_CONSENT_VERSION -b"v1.5.0"

# Actualizar producción
gh secret set PROD_CONSENT_VERSION -b"v1.5.0"

# Verificar
gh secret list | grep CONSENT_VERSION
```

**Método 2: GitHub Web UI**
1. Ve a: https://github.com/RogerPugaRuiz/guiders-backend/settings/secrets/actions
2. Encuentra el secret
3. Clic en **Update**
4. Cambia el valor
5. Clic en **Update secret**
6. Haz un deploy para aplicar cambios

---

## 📚 Documentación Creada

| Documento | Descripción | Ubicación |
|-----------|-------------|-----------|
| **SETUP_CONSENT_SECRETS.md** | Resumen rápido de configuración | Raíz del proyecto |
| **CONSENT_VERSION_MANAGEMENT.md** | Guía completa de gestión | `docs/` |
| **GITHUB_SECRETS_CONSENT_VERSION.md** | Documentación técnica de secrets | `docs/` |
| **SETUP_GITHUB_SECRETS_STEP_BY_STEP.md** | Guía visual paso a paso | `docs/` |
| **CONSENT_VERSION_FORMAT.md** | Formatos válidos de versión | `docs/` (existente) |

### 🛠️ Scripts Creados

| Script | Descripción | Uso |
|--------|-------------|-----|
| **setup-consent-secrets.sh** | Configurador interactivo | `./scripts/setup-consent-secrets.sh` |

---

## 🧪 Testing y Validación

### ✅ Tests Ejecutados

- ✅ Tests unitarios de consent: **27 pasaron**
- ✅ Tests unitarios de visitors-v2: **36 pasaron**
- ✅ Tests E2E de consent: **13 pasaron**
- ✅ Tests E2E de visitors-v2: **18 pasaron**
- ✅ Lint: **Sin errores**

### 🔍 Verificación de Secrets

```bash
# Ver secrets configurados
gh secret list

# Output:
# PROD_CONSENT_VERSION      2025-10-15T07:01:26Z
# STAGING_CONSENT_VERSION   2025-10-15T07:01:15Z
```

---

## 🚀 Próximos Pasos

### 1. Probar Deployment de Staging

```bash
# Hacer un commit vacío para forzar deployment
git commit --allow-empty -m "test: verificar consent version v1.4.0"

# Deploy a staging
git push origin develop

# Monitorear en:
# https://github.com/RogerPugaRuiz/guiders-backend/actions
```

### 2. Verificar en Logs del Workflow

Busca en el step **"Create staging environment config"**:

```
🔧 Creando configuración para staging...
...
CONSENT_VERSION_CURRENT=v1.4.0  ← Debe aparecer esto
...
✅ Archivo .env.staging creado exitosamente
```

### 3. Verificar en el Servidor (Después del Deploy)

```bash
# SSH al servidor de staging
ssh user@staging-server

# Verificar .env
cd /var/www/guiders-backend-staging
grep CONSENT_VERSION .env.staging

# Output esperado:
# CONSENT_VERSION_CURRENT=v1.4.0
```

---

## 📊 Escenarios de Uso

### Escenario 1: Misma Versión en Todos los Entornos (Actual)

```
Staging:    v1.4.0
Producción: v1.4.0
```

**Uso:** Configuración simple, sin necesidad de testing diferenciado.

### Escenario 2: Testing de Nueva Versión

```bash
# 1. Actualizar solo staging
gh secret set STAGING_CONSENT_VERSION -b"v1.5.0"

# 2. Deploy a staging
git push origin develop

# 3. Probar en staging

# 4. Si funciona, actualizar producción
gh secret set PROD_CONSENT_VERSION -b"v1.5.0"
git push origin main
```

### Escenario 3: Rollback Rápido

```bash
# Si hay problema en producción con v1.5.0
gh secret set PROD_CONSENT_VERSION -b"v1.4.0"

# Hacer nuevo deploy
git commit --allow-empty -m "rollback: consent version to v1.4.0"
git push origin main
```

---

## 🎯 Formatos de Versión Soportados

### ✅ Válidos

```
v1.4.0          → Recomendado
v1.4            → Válido
1.4.0           → Se normaliza a v1.4.0
v2.0.0-beta.1   → Con sufijo
v1.5.0-alpha.2  → Pre-release
```

### ❌ Inválidos

```
v1              → Falta versión menor
1               → Falta 'v' y versión menor
version1.4.0    → Formato incorrecto
abc             → No es semántico
```

---

## 🔐 Control de Versiones (Modo Estricto)

Si necesitas controlar estrictamente qué versiones están permitidas:

**Editar:** `src/context/consent/domain/config/consent-version.config.ts`

```typescript
// De:
export const ALLOWED_CONSENT_VERSIONS: string[] = [];

// A:
export const ALLOWED_CONSENT_VERSIONS: string[] = [
  'v1.4.0',
  'v1.5.0',
  'v2.0.0',
];
```

**Efecto:** Solo estas versiones serán aceptadas por el sistema.

---

## 🔄 Flujo de Actualización de Versión

```
┌─────────────────────────────────────────────────┐
│ 1. Nueva política de privacidad publicada      │
│    → Frontend muestra v2.0                      │
└─────────────────┬───────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────┐
│ 2. Backend: Permitir nuevas versiones          │
│    → Editar consent-version.config.ts           │
│    → Agregar v2.0 a ALLOWED_VERSIONS (opcional) │
└─────────────────┬───────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────┐
│ 3. Testing en Staging                           │
│    → gh secret set STAGING_CONSENT_VERSION      │
│    → Probar funcionalidad                        │
└─────────────────┬───────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────┐
│ 4. Deploy a Producción                          │
│    → gh secret set PROD_CONSENT_VERSION         │
│    → Monitorear métricas                         │
└─────────────────┬───────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────┐
│ 5. Deprecar versión antigua (después de 3-6m)  │
│    → Remover de ALLOWED_VERSIONS                │
└─────────────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Problema: Secret no se aplica

**Síntoma:** Deployment usa v1.4.0 aunque configuraste v1.5.0

**Solución:**
```bash
# Verificar el secret
gh secret list | grep CONSENT_VERSION

# Forzar nuevo deployment
git commit --allow-empty -m "force workflow re-run"
git push
```

### Problema: Error "Invalid version format"

**Causa:** Formato incorrecto en el secret

**Solución:**
```bash
# Verificar formato (debe empezar con 'v')
gh secret set STAGING_CONSENT_VERSION -b"v1.4.0"  # ✅ Correcto
# NO: gh secret set STAGING_CONSENT_VERSION -b"1.4.0"  # ❌ Incorrecto
```

### Problema: Tests fallan después del cambio

**Causa:** Tests con versiones hardcodeadas

**Solución:**
```bash
# Ejecutar tests
npm run test:unit -- src/context/consent/
npm run test:e2e -- test/consent.e2e-spec.ts

# Si fallan, verificar que usen getCurrentConsentVersion()
```

---

## 📈 Métricas y Monitoreo

### Consultas MongoDB para Análisis

```javascript
// Ver distribución de versiones en uso
db.visitor_consents.aggregate([
  { $group: { _id: "$version", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);

// Consentimientos de la última semana
db.visitor_consents.find({
  grantedAt: {
    $gte: new Date(Date.now() - 7*24*60*60*1000)
  }
}).count();

// Por versión específica
db.visitor_consents.find({
  version: "v1.4.0",
  status: "granted"
}).count();
```

---

## ✅ Checklist de Completitud

- [x] Configuración centralizada creada
- [x] ConsentVersion actualizado
- [x] Workflows modificados (staging y producción)
- [x] Secrets configurados en GitHub
- [x] Documentación completa creada
- [x] Scripts de ayuda creados
- [x] Tests ejecutados y pasando
- [x] Lint sin errores

---

## 📞 Soporte y Referencias

### Contacto
- **Equipo Backend**
- **Email:** dev@guiders.es

### Enlaces Útiles
- Repositorio: https://github.com/RogerPugaRuiz/guiders-backend
- GitHub Actions: https://github.com/RogerPugaRuiz/guiders-backend/actions
- Secrets: https://github.com/RogerPugaRuiz/guiders-backend/settings/secrets/actions

---

**🎉 Configuración Completada Exitosamente**

Fecha: 2025-10-15
Versión actual: v1.4.0
Secrets configurados: ✅ STAGING_CONSENT_VERSION, PROD_CONSENT_VERSION

---

**Próximo deployment aplicará automáticamente las versiones configuradas.**
