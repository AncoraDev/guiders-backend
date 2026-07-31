# Guía Paso a Paso: Configurar GitHub Secrets para Versiones de Consentimiento

## 📋 Prerequisitos

- Acceso de administrador al repositorio en GitHub
- URL del repositorio: `https://github.com/[TU_USUARIO]/guiders-backend`

---

## 🎯 Paso 1: Acceder a la Configuración de Secrets

### 1.1. Navegar al Repositorio

1. Abre tu navegador
2. Ve a: `https://github.com/[TU_USUARIO]/guiders-backend`
3. Asegúrate de estar en la página principal del repositorio

### 1.2. Acceder a Settings

```
┌─────────────────────────────────────────────────────────┐
│  < > Code    Issues    Pull requests    Actions    ... │
│                                                         │
│  ⚙️  Settings  ← CLIC AQUÍ                             │
└─────────────────────────────────────────────────────────┘
```

**⚠️ Nota:** Si no ves el botón "Settings", es porque no tienes permisos de administrador.

### 1.3. Abrir Secrets and Variables

En el menú lateral izquierdo:

```
┌──────────────────────────┐
│ Settings                 │
├──────────────────────────┤
│ General                  │
│ Access                   │
│ ...                      │
│ Secrets and variables ▼  │ ← CLIC AQUÍ
│   → Actions             │ ← LUEGO CLIC AQUÍ
│   → Codespaces          │
│   → Dependabot          │
│ ...                      │
└──────────────────────────┘
```

**Ruta completa:** Settings → Secrets and variables → Actions

---

## 🔑 Paso 2: Crear Secret para Staging

### 2.1. Iniciar Creación de Secret

En la página de "Actions secrets and variables":

```
┌─────────────────────────────────────────────────────────┐
│ Repository secrets                                       │
│                                                          │
│  🔐 No secrets yet                                       │
│                                                          │
│  [New repository secret]  ← CLIC AQUÍ                   │
└─────────────────────────────────────────────────────────┘
```

### 2.2. Completar el Formulario

Verás un formulario con dos campos:

```
┌─────────────────────────────────────────────────────────┐
│ New secret                                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Name *                                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ STAGING_CONSENT_VERSION                             │ │ ← ESCRIBIR ESTO
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ Secret *                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ v1.4.0                                              │ │ ← ESCRIBIR ESTO
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ [Add secret]  ← CLIC AQUÍ                               │
└─────────────────────────────────────────────────────────┘
```

**Valores a introducir:**

| Campo | Valor |
|-------|-------|
| **Name** | `STAGING_CONSENT_VERSION` |
| **Secret** | `v1.4.0` |

**⚠️ IMPORTANTE:**
- El nombre debe ser EXACTAMENTE `STAGING_CONSENT_VERSION` (mayúsculas, sin espacios)
- El valor debe incluir el prefijo `v` → `v1.4.0`

### 2.3. Guardar el Secret

1. Haz clic en el botón verde **"Add secret"**
2. Verás un mensaje de confirmación: ✅ "Secret STAGING_CONSENT_VERSION was created"

---

## 🔑 Paso 3: Crear Secret para Producción

### 3.1. Crear Segundo Secret

Repite el proceso:

1. Haz clic en **"New repository secret"** nuevamente

### 3.2. Completar el Formulario

```
┌─────────────────────────────────────────────────────────┐
│ New secret                                               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Name *                                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ PROD_CONSENT_VERSION                                │ │ ← ESCRIBIR ESTO
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ Secret *                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ v1.4.0                                              │ │ ← ESCRIBIR ESTO
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ [Add secret]  ← CLIC AQUÍ                               │
└─────────────────────────────────────────────────────────┘
```

**Valores a introducir:**

| Campo | Valor |
|-------|-------|
| **Name** | `PROD_CONSENT_VERSION` |
| **Secret** | `v1.4.0` |

### 3.3. Guardar el Secret

1. Haz clic en **"Add secret"**
2. Confirmación: ✅ "Secret PROD_CONSENT_VERSION was created"

---

## ✅ Paso 4: Verificar los Secrets

Deberías ver ahora la lista de secrets:

```
┌─────────────────────────────────────────────────────────┐
│ Repository secrets                                       │
│                                                          │
│ ┌───────────────────────────────────────────────────┐   │
│ │ PROD_CONSENT_VERSION              Updated 1m ago  │   │
│ │ [Update]  [Remove]                                │   │
│ └───────────────────────────────────────────────────┘   │
│                                                          │
│ ┌───────────────────────────────────────────────────┐   │
│ │ STAGING_CONSENT_VERSION           Updated 2m ago  │   │
│ │ [Update]  [Remove]                                │   │
│ └───────────────────────────────────────────────────┘   │
│                                                          │
│  [New repository secret]                                 │
└─────────────────────────────────────────────────────────┘
```

**✅ Verificación:**
- [ ] Ves `PROD_CONSENT_VERSION` en la lista
- [ ] Ves `STAGING_CONSENT_VERSION` en la lista
- [ ] Ambos muestran "Updated" con timestamp reciente

---

## 🧪 Paso 5: Probar la Configuración

### 5.1. Forzar un Deployment de Test (Opcional)

Para verificar que todo funciona:

```bash
# En tu terminal local
cd /Users/rogerpugaruiz/Proyectos/guiders-backend

# Crear commit vacío para forzar deployment
git commit --allow-empty -m "test: verificar secrets de consent version"

# Deploy a staging
git push origin develop
```

### 5.2. Monitorear el Workflow

1. Ve a la pestaña **"Actions"** en GitHub
2. Verás el workflow "Deploy to Staging" ejecutándose
3. Haz clic en el workflow para ver los logs

### 5.3. Verificar en los Logs

Busca en los logs del step **"Create staging environment config"**:

```
🔧 Creando configuración para staging...
...
CONSENT_VERSION_CURRENT=v1.4.0  ← DEBE APARECER ESTO
...
✅ Archivo .env.staging creado exitosamente
```

---

## 📝 Resumen de Secrets Creados

| Secret Name | Valor | Usado en |
|-------------|-------|----------|
| `STAGING_CONSENT_VERSION` | `v1.4.0` | Deploy a staging (branch: develop) |
| `PROD_CONSENT_VERSION` | `v1.4.0` | Deploy a producción (branch: main) |

---

## 🔄 Cómo Actualizar un Secret

Si necesitas cambiar la versión en el futuro:

### Opción A: Desde la Web UI

1. Ve a Settings → Secrets and variables → Actions
2. Encuentra el secret que quieres actualizar
3. Haz clic en **"Update"**
4. Cambia el valor (ej: de `v1.4.0` a `v1.5.0`)
5. Haz clic en **"Update secret"**
6. Haz un nuevo deploy para que se aplique el cambio

### Opción B: Usando GitHub CLI (si tienes gh instalado)

```bash
# Actualizar staging
gh secret set STAGING_CONSENT_VERSION -b"v1.5.0"

# Actualizar producción
gh secret set PROD_CONSENT_VERSION -b"v1.5.0"
```

---

## 🚨 Troubleshooting

### Problema: No veo el botón "Settings"

**Causa:** No tienes permisos de administrador en el repositorio

**Solución:**
1. Contacta al propietario del repositorio
2. Solicita permisos de "Admin" o "Maintain"
3. Alternativamente, pide al admin que configure los secrets

### Problema: El workflow no usa el secret

**Síntomas:** El deployment usa `v1.4.0` aunque configuraste `v1.5.0`

**Soluciones posibles:**

1. **Verifica el nombre del secret:**
   - Debe ser EXACTAMENTE: `STAGING_CONSENT_VERSION` o `PROD_CONSENT_VERSION`
   - Sin espacios, todo en mayúsculas

2. **Caché del workflow:**
   - Haz un nuevo push para forzar re-ejecución
   ```bash
   git commit --allow-empty -m "force workflow re-run"
   git push
   ```

3. **Verifica los logs:**
   - Ve a Actions → Último workflow
   - Revisa el step "Create staging environment config"
   - Confirma que aparece tu valor

### Problema: Error "Invalid version format"

**Causa:** El formato del secret es incorrecto

**Formato correcto:**
```
✅ v1.4.0
✅ v1.5.0
✅ v2.0.0-beta.1

❌ 1.4.0     (falta 'v')
❌ v1        (falta versión menor)
❌ version1  (formato inválido)
```

**Solución:** Edita el secret y usa formato `vX.Y.Z`

---

## 📞 Soporte

**¿Necesitas ayuda?**
- Consulta: `../consent/GITHUB_SECRETS_CONSENT_VERSION.md` (guía técnica completa)
- Consulta: `../consent/CONSENT_VERSION_MANAGEMENT.md` (gestión de versiones)
- Contacta: Equipo de Backend

---

## ✅ Checklist Final

Antes de terminar, verifica:

- [ ] Tengo acceso de administrador al repositorio
- [ ] He creado el secret `STAGING_CONSENT_VERSION` con valor `v1.4.0`
- [ ] He creado el secret `PROD_CONSENT_VERSION` con valor `v1.4.0`
- [ ] Ambos secrets aparecen en la lista de "Repository secrets"
- [ ] He verificado que los nombres están correctos (sin typos)
- [ ] He probado con un deployment de prueba (opcional)
- [ ] Los logs del workflow muestran el valor correcto

---

**¡Listo!** 🎉 Tus secrets están configurados correctamente.

**Próximos pasos:**
1. Cuando necesites cambiar versión, solo edita el secret
2. Haz un push para desplegar
3. No necesitas modificar código

---

**Fecha de creación:** Octubre 2025
**Última actualización:** Octubre 2025
**Versión:** 1.0.0
