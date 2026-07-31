# Guía para Implementar BFF + Cookies HttpOnly

## 📋 Resumen del Patrón BFF + Cookies HttpOnly

El **Backend For Frontend (BFF)** con **cookies HttpOnly** es un patrón de seguridad que:

- Mantiene los tokens JWT en cookies HttpOnly en lugar del localStorage
- Proporciona una capa de abstracción entre el frontend y los servicios backend
- Mejora la seguridad contra ataques XSS al hacer los tokens inaccesibles desde JavaScript
- Implementa manejo automático de renovación de tokens

## 🔧 Implementación Requerida

### 1. Instalación de Dependencias

```bash
npm install cookie-parser express-session
npm install -D @types/cookie-parser @types/express-session
```

### 2. Configuración del Main.ts

Necesitas configurar el middleware de cookies y ajustar CORS:

```typescript
// src/main.ts
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Middleware para manejar cookies
  app.use(cookieParser());
  
  // Configuración CORS actualizada para cookies
  const corsOptions = {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:4001',
      'http://localhost:3000', // Para desarrollo
    ],
    credentials: true, // ✅ Ya está configurado
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Origin',
      'Referer',
      'X-Requested-With',
      'Accept',
      'Cache-Control',
      'X-Real-IP',
      'X-Forwarded-For',
      'X-Forwarded-Proto',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  };
  
  app.enableCors(corsOptions);
  
  // Resto de la configuración...
}
```

### 3. Estrategia de Autenticación con Cookies

Crear una nueva estrategia JWT que busque tokens en cookies:

```typescript
// src/context/auth/auth-user/infrastructure/strategies/jwt-cookie.strategy.ts
import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { passportJwtSecret } from 'jwks-rsa';

interface KeycloakJwt {
  sub: string;
  email?: string;
  iss: string;
  aud: string | string[];
  realm_access?: { roles?: string[] };
}

@Injectable()
export class JwtCookieStrategy extends PassportStrategy(Strategy, 'jwt-cookie') {
  private readonly logger = new Logger(JwtCookieStrategy.name);

  constructor() {
    const issuer = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/guiders';
    const jwksUri = process.env.KEYCLOAK_JWKS_URI ?? 
      'http://localhost:8080/realms/guiders/protocol/openid-connect/certs';
    const audience = process.env.KEYCLOAK_AUDIENCE ?? 'guiders-api';

    super({
      // Extraer JWT de cookies en lugar del header
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          let token = null;
          if (request && request.cookies) {
            token = request.cookies['access_token'];
          }
          return token;
        },
      ]),
      algorithms: ['RS256'],
      issuer,
      audience,
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        jwksUri,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      }),
    });

    this.logger.debug('🍪 JWT Cookie Strategy initialized');
    this.logger.debug(`  - Issuer: ${issuer}`);
    this.logger.debug(`  - JWKS URI: ${jwksUri}`);
    this.logger.debug(`  - Audience: ${audience}`);
  }

  validate(payload: KeycloakJwt) {
    this.logger.debug('🍪 Validating JWT from cookie');
    this.logger.debug(`  - User ID: ${payload.sub}`);
    this.logger.debug(`  - Email: ${payload.email}`);

    const roles = Array.isArray(payload.realm_access?.roles)
      ? payload.realm_access.roles
      : [];

    return { sub: payload.sub, email: payload.email, roles };
  }
}
```

### 4. Guard para Cookies HttpOnly

Crear un guard que use la estrategia de cookies:

```typescript
// src/context/shared/infrastructure/guards/jwt-cookie-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtCookieAuthGuard extends AuthGuard('jwt-cookie') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Token de autenticación requerido en cookie');
    }
    return user;
  }
}
```

### 5. Servicio BFF para Autenticación

Crear un servicio que maneje la autenticación con cookies:

```typescript
// src/context/auth/bff/infrastructure/bff-auth.service.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class BFFAuthService {
  private readonly logger = new Logger(BFFAuthService.name);

  constructor(private readonly httpService: HttpService) {}

  async loginWithKeycloak(
    username: string,
    password: string,
    response: Response,
  ): Promise<{ success: boolean; user?: any }> {
    try {
      const keycloakTokenUrl = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
      
      const tokenRequest = {
        grant_type: 'password',
        client_id: process.env.KEYCLOAK_CLIENT_ID || 'guiders-api',
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
        username,
        password,
      };

      const tokenResponse = await firstValueFrom(
        this.httpService.post(keycloakTokenUrl, tokenRequest, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Configurar cookies HttpOnly
      this.setAuthCookies(response, access_token, refresh_token, expires_in);

      // Extraer información del usuario del token
      const userInfo = await this.getUserInfo(access_token);

      this.logger.log(`Usuario autenticado: ${userInfo.email}`);

      return { success: true, user: userInfo };
    } catch (error) {
      this.logger.error('Error en login con Keycloak:', error);
      throw new UnauthorizedException('Credenciales inválidas');
    }
  }

  async refreshToken(
    refreshToken: string,
    response: Response,
  ): Promise<{ success: boolean }> {
    try {
      const keycloakTokenUrl = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
      
      const refreshRequest = {
        grant_type: 'refresh_token',
        client_id: process.env.KEYCLOAK_CLIENT_ID || 'guiders-api',
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
        refresh_token: refreshToken,
      };

      const tokenResponse = await firstValueFrom(
        this.httpService.post(keycloakTokenUrl, refreshRequest, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Actualizar cookies
      this.setAuthCookies(response, access_token, refresh_token, expires_in);

      return { success: true };
    } catch (error) {
      this.logger.error('Error renovando token:', error);
      throw new UnauthorizedException('Token de renovación inválido');
    }
  }

  logout(response: Response): void {
    // Limpiar cookies
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    this.logger.log('Usuario desconectado - cookies limpiadas');
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Cookie para access token (más corta)
    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: expiresIn * 1000, // Convertir a ms
      path: '/',
    });

    // Cookie para refresh token (más larga)
    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      path: '/api/auth', // Solo accesible en rutas de auth
    });
  }

  private async getUserInfo(accessToken: string): Promise<any> {
    try {
      const userInfoUrl = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`;
      
      const userResponse = await firstValueFrom(
        this.httpService.get(userInfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );

      return userResponse.data;
    } catch (error) {
      this.logger.error('Error obteniendo información del usuario:', error);
      throw error;
    }
  }
}
```

### 6. Controlador BFF

```typescript
// src/context/auth/bff/infrastructure/controllers/bff-auth.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  Res, 
  Req, 
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { BFFAuthService } from '../bff-auth.service';
import { JwtCookieAuthGuard } from 'src/context/shared/infrastructure/guards/jwt-cookie-auth.guard';

@ApiTags('BFF Authentication')
@Controller('bff/auth')
export class BFFAuthController {
  constructor(private readonly bffAuthService: BFFAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión (BFF con cookies HttpOnly)' })
  @ApiResponse({ status: 200, description: 'Login exitoso - cookies configuradas' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(
    @Body() loginDto: { username: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.bffAuthService.loginWithKeycloak(
      loginDto.username,
      loginDto.password,
      response,
    );

    return {
      success: true,
      message: 'Autenticación exitosa',
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar token de acceso' })
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies['refresh_token'];
    
    if (!refreshToken) {
      throw new UnauthorizedException('Token de renovación no encontrado');
    }

    await this.bffAuthService.refreshToken(refreshToken, response);

    return { success: true, message: 'Token renovado exitosamente' };
  }

  @Post('logout')
  @UseGuards(JwtCookieAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión' })
  async logout(@Res({ passthrough: true }) response: Response) {
    this.bffAuthService.logout(response);

    return { success: true, message: 'Sesión cerrada exitosamente' };
  }

  @Post('me')
  @UseGuards(JwtCookieAuthGuard)
  @ApiOperation({ summary: 'Obtener información del usuario autenticado' })
  async getMe(@Req() request: any) {
    return {
      success: true,
      user: request.user,
    };
  }
}
```

### 7. Módulo BFF

```typescript
// src/context/auth/bff/infrastructure/bff.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { BFFAuthController } from './controllers/bff-auth.controller';
import { BFFAuthService } from './bff-auth.service';
import { JwtCookieStrategy } from '../auth-user/infrastructure/strategies/jwt-cookie.strategy';
import { JwtCookieAuthGuard } from 'src/context/shared/infrastructure/guards/jwt-cookie-auth.guard';

@Module({
  imports: [
    HttpModule,
    PassportModule.register({ defaultStrategy: 'jwt-cookie' }),
  ],
  controllers: [BFFAuthController],
  providers: [
    BFFAuthService,
    JwtCookieStrategy,
    JwtCookieAuthGuard,
  ],
  exports: [BFFAuthService, JwtCookieAuthGuard],
})
export class BFFModule {}
```

### 8. Variables de Entorno Adicionales

Añadir al archivo `.env`:

```bash
# BFF + Keycloak Configuration
KEYCLOAK_CLIENT_ID=guiders-api
KEYCLOAK_CLIENT_SECRET=your-client-secret-here
FRONTEND_URL=http://localhost:4001

# Session Configuration
SESSION_SECRET=your-super-secret-session-key
```

### 9. Middleware de Renovación Automática

```typescript
// src/context/shared/infrastructure/middleware/token-refresh.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { BFFAuthService } from 'src/context/auth/bff/infrastructure/bff-auth.service';

@Injectable()
export class TokenRefreshMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TokenRefreshMiddleware.name);

  constructor(private readonly bffAuthService: BFFAuthService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const accessToken = req.cookies['access_token'];
    const refreshToken = req.cookies['refresh_token'];

    // Si no hay access token pero sí refresh token, intentar renovar
    if (!accessToken && refreshToken) {
      try {
        await this.bffAuthService.refreshToken(refreshToken, res);
        this.logger.debug('Token renovado automáticamente');
      } catch (error) {
        this.logger.warn('Error renovando token automáticamente:', error);
        // Limpiar cookies inválidas
        res.clearCookie('refresh_token');
      }
    }

    next();
  }
}
```

### 10. Actualización del AppModule

```typescript
// En src/app.module.ts - añadir a los imports:
import { BFFModule } from './context/auth/bff/infrastructure/bff.module';

@Module({
  imports: [
    // ... otros imports
    BFFModule, // Añadir aquí
  ],
  // ... resto de la configuración
})
export class AppModule {
  // Configurar middleware si es necesario
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TokenRefreshMiddleware)
      .forRoutes({ path: '/api/*', method: RequestMethod.ALL });
  }
}
```

## 🔄 Flujo de Autenticación BFF

1. **Login**: Frontend envía credenciales → BFF → Keycloak → cookies HttpOnly
2. **Requests**: Frontend hace peticiones → cookies automáticamente enviadas
3. **Validación**: Guard verifica token en cookies → permite/rechaza
4. **Renovación**: Middleware renueva automáticamente tokens expirados
5. **Logout**: Limpia cookies HttpOnly

## ✅ Ventajas de esta Implementación

- **Seguridad mejorada**: Tokens inaccesibles desde JavaScript
- **Renovación automática**: Sin interrupciones para el usuario
- **Compatibilidad CORS**: Funciona con dominios cruzados
- **Transparente**: Frontend no maneja tokens directamente

¿Te gustaría que implemente alguna parte específica de esta arquitectura?
