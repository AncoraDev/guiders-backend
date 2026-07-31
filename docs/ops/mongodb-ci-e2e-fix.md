# Resolución de Errores MongoDB en GitHub Actions E2E Tests

## Problema Original
Los tests E2E fallaban en GitHub Actions con el error:
```
MongooseServerSelectionError: connect ECONNREFUSED ::1:27018
```

## Causa Raíz
1. **Puerto incorrecto**: El código intentaba conectar al puerto `27018` en lugar del estándar `27017`
2. **Memory Server en CI**: MongoDB Memory Server tenía problemas de compatibilidad en el entorno de GitHub Actions
3. **Falta de servicio MongoDB**: No había un servicio MongoDB real disponible en el pipeline de CI

## Solución Implementada

### 1. Configuración específica para CI (`test/jest-e2e.ci.json`)
```json
{
  "testTimeout": 120000,
  "setupFilesAfterEnv": ["<rootDir>/jest-e2e.ci.setup.ts"],
  "maxWorkers": 1,
  "detectOpenHandles": true,
  "forceExit": true
}
```

### 2. Setup especializado para CI (`test/jest-e2e.ci.setup.ts`)
- Detecta automáticamente si está corriendo en CI (`process.env.CI`)
- En CI: usa servicio MongoDB real
- En local: mantiene MongoDB Memory Server

### 3. Helper MongoDB mejorado (`test/helpers/mongo-test.helper.ts`)
```typescript
export class MongoTestHelper {
  static getMongoConfig(): MongooseModuleOptions {
    const isCI = process.env.CI === 'true';
    
    if (isCI) {
      // Usar servicio MongoDB real en CI
      return {
        uri: `mongodb://${process.env.TEST_MONGODB_HOST}:${process.env.TEST_MONGODB_PORT}/guiders-test-e2e`,
        authSource: 'admin'
      };
    }
    
    // Usar Memory Server en desarrollo local
    return { uri: this.mongoUri };
  }
}
```

### 4. GitHub Actions con servicio MongoDB (`.github/workflows/deploy-staging.yml`)
```yaml
services:
  mongodb:
    image: mongo:5.0.13
    ports:
      - 27017:27017
    options: >-
      --health-cmd "mongosh --eval 'db.adminCommand(\"ping\")'"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

### 5. Variables de entorno para CI
```yaml
env:
  TEST_MONGODB_HOST: localhost
  TEST_MONGODB_PORT: 27017
```

### 6. Script npm específico para CI (`package.json`)
```json
{
  "scripts": {
    "test:e2e:ci": "NODE_ENV=test CI=true jest --config ./test/jest-e2e.ci.json --passWithNoTests --coverage"
  }
}
```

## Archivos Modificados/Creados

### Nuevos archivos:
- `test/jest-e2e.ci.json` - Configuración Jest específica para CI
- `test/jest-e2e.ci.setup.ts` - Setup de tests E2E para CI
- `test/helpers/mongo-test.helper.ts` - Helper para configuración MongoDB
- `scripts/verify-e2e-ci-setup.js` - Script de verificación

### Archivos modificados:
- `.github/workflows/deploy-staging.yml` - Agregado servicio MongoDB
- `package.json` - Script `test:e2e:ci`

## Correcciones de TypeScript
También se resolvieron errores de tipos `any` unsafe en:
- `process-auto-assignment-on-chat-auto-assignment-requested.event-handler.ts`
- `assignment-rules.controller.ts`

## Verificación
Ejecutar `node scripts/verify-e2e-ci-setup.js` para confirmar que toda la configuración está correcta.

## Resultado
✅ Tests E2E ahora funcionan correctamente en GitHub Actions
✅ Conexión estable a MongoDB en CI
✅ Compatibilidad mantenida con desarrollo local
✅ Eliminados errores de tipos TypeScript unsafe