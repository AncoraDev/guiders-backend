# Compatibilidad Semántica de Versiones de Consentimiento

## 📋 Resumen

El sistema ahora soporta **compatibilidad semántica (Semantic Versioning)** para versiones de consentimiento, permitiendo que el backend acepte automáticamente versiones MINOR y PATCH superiores sin necesidad de configuración manual.

---

## 🎯 ¿Qué es Semantic Versioning?

Semantic Versioning (semver) es un estándar de versionado que usa el formato:

```
MAJOR.MINOR.PATCH

Ejemplo: v1.4.2
         │ │ │
         │ │ └─ PATCH: Bug fixes, correcciones menores
         │ └─── MINOR: Nuevas features compatibles hacia atrás
         └───── MAJOR: Cambios incompatibles (breaking changes)
```

---

## ✅ Reglas de Compatibilidad

### Cuando el Backend está en v1.4.0:

| Versión SDK | Resultado | Razón |
|-------------|-----------|-------|
| **v1.4.0** | ✅ Acepta | Versión exacta |
| **v1.4.1** | ✅ Acepta | PATCH superior (bug fix compatible) |
| **v1.4.2** | ✅ Acepta | PATCH superior |
| **v1.4.99** | ✅ Acepta | PATCH superior |
| **v1.5.0** | ✅ Acepta | MINOR superior (nueva feature compatible) |
| **v1.5.1** | ✅ Acepta | MINOR superior con PATCH |
| **v1.10.0** | ✅ Acepta | MINOR superior |
| **v1.3.0** | ❌ Rechaza | MINOR inferior (versión obsoleta) |
| **v1.3.9** | ❌ Rechaza | MINOR inferior |
| **v2.0.0** | ❌ Rechaza | MAJOR diferente (breaking change) |
| **v0.9.0** | ❌ Rechaza | MAJOR diferente |

### Regla General:

```typescript
Compatible si:
  - MAJOR es igual
  - MINOR >= backend.MINOR
  - Si MINOR es igual: PATCH >= backend.PATCH
```

---

## 🔧 Configuración

### Habilitar Compatibilidad Semántica (Por Defecto: HABILITADO)

#### Opción 1: Constante en Código (Desarrollo)

```typescript
// src/context/consent/domain/config/consent-version.config.ts

export const ENABLE_SEMVER_COMPATIBILITY = true; // ✅ Habilitado
// export const ENABLE_SEMVER_COMPATIBILITY = false; // ❌ Deshabilitado
```

#### Opción 2: Variable de Entorno (Producción)

```bash
# .env
ENABLE_SEMVER_COMPATIBILITY=true  # Habilitar
# ENABLE_SEMVER_COMPATIBILITY=false  # Deshabilitar
```

**Prioridad:** ENV > Constante

---

## 📊 Modos de Validación

El sistema tiene 3 modos de validación, en orden de prioridad:

### 1. Modo Semver (Recomendado) ✅

**Activado cuando:** `ENABLE_SEMVER_COMPATIBILITY=true`

**Comportamiento:**
- Acepta versiones MINOR y PATCH superiores automáticamente
- Rechaza versiones MAJOR diferentes
- Rechaza versiones obsoletas (MINOR inferior)

**Ejemplo:**
```bash
# Backend: v1.4.0

v1.4.1 → ✅ Aceptada (PATCH superior)
v1.5.0 → ✅ Aceptada (MINOR superior)
v1.3.0 → ❌ Rechazada (MINOR inferior)
v2.0.0 → ❌ Rechazada (MAJOR diferente)
```

### 2. Modo Whitelist (Estricto)

**Activado cuando:** `ALLOWED_CONSENT_VERSIONS` no está vacío Y semver deshabilitado

**Comportamiento:**
- Solo acepta versiones listadas explícitamente
- Control total sobre versiones permitidas

**Configuración:**
```typescript
export const ALLOWED_CONSENT_VERSIONS = [
  'v1.3.0',
  'v1.4.0',
  'v1.5.0',
];

// Solo estas 3 versiones serán aceptadas
```

### 3. Modo Permisivo

**Activado cuando:** Semver deshabilitado Y whitelist vacía

**Comportamiento:**
- Acepta cualquier versión con formato semántico válido
- Sin validación de compatibilidad

---

## 🚀 Casos de Uso

### Escenario 1: Bug Fix en Política de Privacidad

**Situación:**
- Backend: v1.4.0
- Frontend publica hotfix: v1.4.1 (corrección de typo)

**Resultado:**
```
SDK envía: v1.4.1
Backend: ✅ Acepta automáticamente (PATCH superior)
```

**Ventaja:** No requiere actualización del backend

### Escenario 2: Nueva Sección en Política

**Situación:**
- Backend: v1.4.0
- Frontend agrega nueva sección: v1.5.0

**Resultado:**
```
SDK envía: v1.5.0
Backend: ✅ Acepta automáticamente (MINOR superior)
```

**Ventaja:** Compatible hacia atrás, sin cambios backend

### Escenario 3: Breaking Change (Nueva MAJOR)

**Situación:**
- Backend: v1.4.0
- Frontend cambia estructura completa: v2.0.0

**Resultado:**
```
SDK envía: v2.0.0
Backend: ❌ Rechaza (MAJOR diferente)
Error: "Backend requiere versión MAJOR 1.x.x. Por favor actualiza el SDK"
```

**Acción requerida:**
```bash
# Actualizar backend primero
gh secret set STAGING_CONSENT_VERSION -b"v2.0.0"
git push origin develop
```

### Escenario 4: Rollback Frontend

**Situación:**
- Backend: v1.5.0
- Frontend hace rollback a: v1.4.0

**Resultado:**
```
SDK envía: v1.4.0
Backend: ❌ Rechaza (MINOR inferior)
Error: "Versión obsoleta. Backend requiere versión mínima v1.5.0"
```

**Acción requerida:**
```bash
# Rollback backend también
gh secret set STAGING_CONSENT_VERSION -b"v1.4.0"
git push origin develop
```

---

## 📝 Flujo de Actualización de Versión

### Actualización PATCH (Bug Fix)

```
┌─────────────────────────────────────────┐
│ 1. Frontend: Corregir typo en política │
│    → Publicar v1.4.1                    │
└─────────────┬───────────────────────────┘
              ▼
┌─────────────────────────────────────────┐
│ 2. SDK: Enviar v1.4.1 en requests      │
└─────────────┬───────────────────────────┘
              ▼
┌─────────────────────────────────────────┐
│ 3. Backend: ✅ Acepta automáticamente   │
│    (No requiere cambios)                │
└─────────────────────────────────────────┘
```

**Tiempo total:** Minutos (solo deploy frontend)

### Actualización MINOR (Nueva Feature)

```
┌──────────────────────────────────────────┐
│ 1. Frontend: Agregar nueva sección       │
│    → Publicar v1.5.0                     │
└─────────────┬────────────────────────────┘
              ▼
┌──────────────────────────────────────────┐
│ 2. SDK: Enviar v1.5.0 en requests       │
└─────────────┬────────────────────────────┘
              ▼
┌──────────────────────────────────────────┐
│ 3. Backend: ✅ Acepta automáticamente    │
│    (Compatible hacia atrás)              │
└──────────────────────────────────────────┘
```

**Tiempo total:** Minutos (solo deploy frontend)

### Actualización MAJOR (Breaking Change)

```
┌──────────────────────────────────────────┐
│ 1. Backend: Actualizar primero           │
│    gh secret set PROD_CONSENT_VERSION    │
│    -b"v2.0.0"                             │
└─────────────┬────────────────────────────┘
              ▼
┌──────────────────────────────────────────┐
│ 2. Deploy backend a producción           │
│    git push origin main                  │
└─────────────┬────────────────────────────┘
              ▼
┌──────────────────────────────────────────┐
│ 3. Frontend: Publicar v2.0.0             │
└─────────────┬────────────────────────────┘
              ▼
┌──────────────────────────────────────────┐
│ 4. SDK: Enviar v2.0.0 en requests       │
└─────────────┬────────────────────────────┘
              ▼
┌──────────────────────────────────────────┐
│ 5. Backend: ✅ Acepta v2.0.0             │
└──────────────────────────────────────────┘
```

**Tiempo total:** ~15-30 minutos (deploy backend + frontend)

---

## 🧪 Testing

### Tests de Compatibilidad

El sistema incluye 42 tests que validan:

```bash
# Ejecutar tests de semver
npm run test:unit -- src/context/consent/domain/config/__tests__/consent-version-semver.spec.ts

# Output esperado:
# ✅ 42 tests passed
```

**Cobertura:**
- ✅ Parsing de versiones
- ✅ Comparación de versiones
- ✅ Compatibilidad semántica
- ✅ Integración con `isConsentVersionAllowed()`
- ✅ Casos edge y escenarios reales

### Probar Manualmente

```bash
# 1. Configurar backend
export CONSENT_VERSION_CURRENT=v1.4.0
export ENABLE_SEMVER_COMPATIBILITY=true

# 2. Ejecutar test E2E
npm run test:e2e -- test/consent.e2e-spec.ts

# 3. Verificar logs
# Buscar: "✅ Versión compatible: v1.4.1 con backend v1.4.0"
```

---

## 🔍 Mensajes de Error

### Error: Versión MAJOR diferente

```
Error: Versión de consentimiento no compatible: v2.0.0
Backend requiere versión MAJOR 1.x.x
Por favor actualiza el SDK o contacta soporte.
```

**Causa:** SDK envía v2.0.0 pero backend está en v1.x.x

**Solución:** Actualizar backend primero

### Error: Versión obsoleta (MINOR inferior)

```
Error: Versión de consentimiento obsoleta: v1.3.0
Backend requiere versión mínima v1.4.0
Por favor actualiza tu política de privacidad.
```

**Causa:** SDK envía versión anterior a la mínima requerida

**Solución:** Actualizar frontend o hacer rollback backend

### Error: Formato inválido

```
Error: Versión de consentimiento inválida: invalid
Formato esperado: v1.0, v1.0.0, v1.2.3-alpha.1
```

**Causa:** Formato de versión incorrecto

**Solución:** Usar formato semántico válido (vX.Y.Z)

---

## ⚙️ Configuración Avanzada

### Deshabilitar Semver Temporalmente

```bash
# .env
ENABLE_SEMVER_COMPATIBILITY=false

# Ahora acepta cualquier versión con formato válido
# (o usa whitelist si está configurada)
```

### Combinar con Whitelist (No Recomendado)

```typescript
// Si semver está habilitado, whitelist se ignora
export const ENABLE_SEMVER_COMPATIBILITY = true; // ✅ Activo
export const ALLOWED_CONSENT_VERSIONS = ['v1.4.0']; // ❌ Ignorada

// Para usar whitelist, deshabilitar semver
export const ENABLE_SEMVER_COMPATIBILITY = false; // ❌ Deshabilitado
export const ALLOWED_CONSENT_VERSIONS = ['v1.4.0']; // ✅ Usada
```

---

## 📊 Comparación de Modos

| Característica | Semver | Whitelist | Permisivo |
|----------------|--------|-----------|-----------|
| **Acepta PATCH superior** | ✅ Sí | ❌ Solo si está en lista | ✅ Sí |
| **Acepta MINOR superior** | ✅ Sí | ❌ Solo si está en lista | ✅ Sí |
| **Rechaza MAJOR diferente** | ✅ Sí | ✅ Sí (si no está) | ❌ No |
| **Rechaza versiones obsoletas** | ✅ Sí | ❌ Acepta si está en lista | ❌ No |
| **Mantenimiento** | ✅ Bajo | ⚠️ Alto (actualizar lista) | ❌ Sin control |
| **Seguridad** | ✅ Alta | ✅ Alta | ⚠️ Baja |
| **Flexibilidad** | ✅ Alta | ❌ Baja | ✅ Muy alta |
| **Recomendado para** | **Producción** | Testing específico | Desarrollo local |

---

## 🆘 Troubleshooting

### Problema: Semver no funciona

**Síntoma:** Backend rechaza v1.4.1 aunque está en v1.4.0

**Diagnóstico:**
```bash
# Verificar configuración
echo $ENABLE_SEMVER_COMPATIBILITY  # Debe ser "true"
echo $CONSENT_VERSION_CURRENT      # Debe ser v1.4.0

# Verificar en logs
# Buscar: "✅ SEMVER habilitado" o "❌ SEMVER deshabilitado"
```

**Solución:**
```bash
# Habilitar explícitamente
export ENABLE_SEMVER_COMPATIBILITY=true

# O en .env
ENABLE_SEMVER_COMPATIBILITY=true
```

### Problema: Acepta versiones que no debería

**Síntoma:** Backend acepta v2.0.0 cuando está en v1.4.0

**Causa:** Semver deshabilitado y modo permisivo activo

**Solución:**
```bash
# Habilitar semver
ENABLE_SEMVER_COMPATIBILITY=true

# O usar whitelist
ENABLE_SEMVER_COMPATIBILITY=false
ALLOWED_CONSENT_VERSIONS=["v1.4.0", "v1.4.1"]
```

---

## 📚 Referencias

| Documento | Descripción |
|-----------|-------------|
| **consent-version.config.ts** | Implementación de semver |
| **consent-version-semver.spec.ts** | Tests de compatibilidad |
| **CONSENT_VERSION_MANAGEMENT.md** | Gestión general de versiones |
| **https://semver.org** | Especificación oficial de Semantic Versioning |

---

## ✅ Checklist de Implementación

Para verificar que semver está funcionando correctamente:

- [ ] `ENABLE_SEMVER_COMPATIBILITY=true` en configuración
- [ ] Tests pasando (42 tests)
- [ ] Backend acepta versiones PATCH superiores
- [ ] Backend acepta versiones MINOR superiores
- [ ] Backend rechaza versiones MAJOR diferentes
- [ ] Backend rechaza versiones obsoletas (MINOR inferior)
- [ ] Mensajes de error claros y descriptivos
- [ ] Documentación actualizada

---

**Fecha:** Octubre 2025
**Versión del documento:** 1.0.0
**Estado:** ✅ Implementado y testeado
