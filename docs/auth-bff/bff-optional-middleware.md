# Configuración Opcional: Middleware de Renovación Automática

Si deseas implementar renovación automática de tokens en el middleware de NestJS, puedes usar la configuración siguiente:

## Importación del Middleware en AppModule

```typescript
// src/app.module.ts
import { MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TokenRefreshMiddleware } from './context/shared/infrastructure/middleware/token-refresh.middleware';
import { BFFModule } from './context/auth/bff/infrastructure/bff.module';

@Module({
  imports: [
    // ... otros imports
    BFFModule,
  ],
  // ... resto de configuración
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TokenRefreshMiddleware)
      .exclude(
        // Excluir rutas de auth para evitar loops
        { path: '/bff/auth/(.*)', method: RequestMethod.ALL },
        // Excluir documentación
        { path: '/docs(.*)', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '/api/*', method: RequestMethod.ALL });
  }
}
```

## Funcionalidad

Este middleware intercepta TODAS las peticiones y:

1. **Verifica** si existe un `access_token` en las cookies
2. **Si NO hay access_token pero SÍ hay refresh_token**: Intenta renovar automáticamente
3. **Si la renovación falla**: Limpia las cookies inválidas
4. **Continúa** con la petición normal

## Ventajas

- ✅ **Transparente**: El usuario no nota interrupciones
- ✅ **Automático**: No requiere código adicional en el frontend
- ✅ **Preventivo**: Renueva antes de que expire en peticiones

## Desventajas

- ⚠️ **Overhead**: Se ejecuta en TODAS las peticiones
- ⚠️ **Complejidad**: Puede ocultar problemas de autenticación
- ⚠️ **Race conditions**: Múltiples peticiones simultáneas pueden causar renovaciones duplicadas

## Recomendación

Para la mayoría de casos de uso, **NO es necesario** este middleware. La renovación en el frontend con interceptors es suficiente y más eficiente.

Usa este middleware solo si:
- Tienes muchas peticiones simultáneas
- Quieres máxima transparencia para el usuario
- Prefieres lógica server-side para el manejo de tokens