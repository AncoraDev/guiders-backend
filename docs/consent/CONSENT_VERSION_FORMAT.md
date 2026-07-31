# Formato de Versión de Consentimientos (consentVersion)

## 📋 Resumen

El campo `consentVersion` permite trackear qué versión de la política de privacidad aceptó el usuario (cumplimiento RGPD Art. 7.1).

---

## ✅ Formatos Aceptados

El backend **normaliza automáticamente** la versión agregando el prefijo `v` si no lo tiene.

| Frontend Envía | Backend Guarda | Estado |
|----------------|----------------|--------|
| `"1.0"` | `"v1.0"` | ✅ |
| `"v1.0"` | `"v1.0"` | ✅ |
| `"1.0.0"` | `"v1.0.0"` | ✅ |
| `"v1.0.0"` | `"v1.0.0"` | ✅ |
| `"1.2.3-alpha.1"` | `"v1.2.3-alpha.1"` | ✅ |
| `"v1.2.3-alpha.1"` | `"v1.2.3-alpha.1"` | ✅ |
| `"2.0.0-beta.5"` | `"v2.0.0-beta.5"` | ✅ |
| `"v3.1.4-rc.2"` | `"v3.1.4-rc.2"` | ✅ |
| `"abc"` | ❌ Error | Inválido |
| `"v1"` | ❌ Error | Inválido (requiere X.Y mínimo) |

---

## 🔍 Patrón de Validación

El backend valida con esta expresión regular:

```regex
/^v\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.-]+)?$/
```

**Explicación**:
- `^v` - Debe comenzar con "v"
- `\d+\.\d+` - Versión mayor y menor obligatorios (ej: `1.0`)
- `(\.\d+)?` - Versión de parche opcional (ej: `.0`)
- `(-[a-zA-Z0-9.-]+)?` - Sufijo opcional (ej: `-alpha.1`, `-beta.2`, `-rc.1`)
- `$` - Fin del string

---

## 📝 Ejemplos de Uso

### Ejemplo 1: Versión Simple

```typescript
// Frontend
await fetch('/api/visitors/identify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fingerprint: 'abc123',
    domain: 'example.com',
    apiKey: 'your-api-key',
    hasAcceptedPrivacyPolicy: true,
    consentVersion: '1.0', // ← Sin prefijo "v"
  }),
});

// Backend guarda: "v1.0"
```

### Ejemplo 2: Versión con Parche

```typescript
// Frontend
await fetch('/api/visitors/identify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fingerprint: 'abc123',
    domain: 'example.com',
    apiKey: 'your-api-key',
    hasAcceptedPrivacyPolicy: true,
    consentVersion: '1.2.3', // ← Sin prefijo "v"
  }),
});

// Backend guarda: "v1.2.3"
```

### Ejemplo 3: Versión Pre-release

```typescript
// Frontend
await fetch('/api/visitors/identify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fingerprint: 'abc123',
    domain: 'example.com',
    apiKey: 'your-api-key',
    hasAcceptedPrivacyPolicy: true,
    consentVersion: '1.2.3-alpha.1', // ← Sin prefijo "v"
  }),
});

// Backend guarda: "v1.2.3-alpha.1"
```

### Ejemplo 4: Versión con Prefijo (Compatible)

```typescript
// Frontend
await fetch('/api/visitors/identify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fingerprint: 'abc123',
    domain: 'example.com',
    apiKey: 'your-api-key',
    hasAcceptedPrivacyPolicy: true,
    consentVersion: 'v1.2.3-beta.2', // ← Con prefijo "v"
  }),
});

// Backend guarda: "v1.2.3-beta.2"
```

---

## 🐛 Errores Comunes

### Error 1: Versión sin formato X.Y

```typescript
// ❌ INCORRECTO
consentVersion: "v1" // Falta versión menor

// ✅ CORRECTO
consentVersion: "1.0" // v1.0
```

### Error 2: Versión con caracteres inválidos

```typescript
// ❌ INCORRECTO
consentVersion: "version-1.0" // Texto no permitido

// ✅ CORRECTO
consentVersion: "1.0.0-alpha.1" // v1.0.0-alpha.1
```

### Error 3: Sufijo con espacios

```typescript
// ❌ INCORRECTO
consentVersion: "1.0 alpha" // Espacios no permitidos

// ✅ CORRECTO
consentVersion: "1.0-alpha.1" // v1.0-alpha.1
```

---

## 🧪 Testing

### Casos de Prueba

```typescript
describe('ConsentVersion', () => {
  it('should normalize version without prefix', () => {
    const version = ConsentVersion.fromString('1.0');
    expect(version.value).toBe('v1.0');
  });

  it('should accept version with prefix', () => {
    const version = ConsentVersion.fromString('v1.0');
    expect(version.value).toBe('v1.0');
  });

  it('should accept version with patch', () => {
    const version = ConsentVersion.fromString('1.2.3');
    expect(version.value).toBe('v1.2.3');
  });

  it('should accept pre-release version', () => {
    const version = ConsentVersion.fromString('1.2.3-alpha.1');
    expect(version.value).toBe('v1.2.3-alpha.1');
  });

  it('should reject invalid version', () => {
    expect(() => ConsentVersion.fromString('abc')).toThrow();
  });
});
```

---

## 🔗 Referencias

- **Archivo**: `src/context/consent/domain/value-objects/consent-version.ts`
- **RGPD**: Art. 7.1 - Condiciones para el consentimiento
- **Documentación**: [FRONTEND_CONSENT_INTEGRATION.md](./FRONTEND_CONSENT_INTEGRATION.md)

---

**Última actualización**: Octubre 2025
**Versión**: 1.0.0
