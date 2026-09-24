// Cargar .env antes de cualquier inicialización para garantizar que process.env esté poblado
// (necesario para SESSION_STORE, REDIS_URL, etc. que se leen en bootstrap antes de NestJS)
import * as dotenv from 'dotenv';
import * as path from 'path';
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile =
  nodeEnv === 'production'
    ? '.env.production'
    : nodeEnv === 'staging'
      ? '.env.staging'
      : nodeEnv === 'test'
        ? '.env.test'
        : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import {
  createOpenApiDocument,
  createPublicOpenApiDocument,
} from './context/shared/infrastructure/swagger';
import * as cookieParser from 'cookie-parser';
import * as session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient, type RedisClientType } from 'redis';
import * as fs from 'fs';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import * as bodyParser from 'body-parser';
import {
  parseAllowedOrigins,
  mergeAllowedOrigins,
} from './context/shared/utils/cors-origins.util';
import { CorsSiteOriginService } from './context/company/infrastructure/services/cors-site-origin.service';

// Tipo reducido para evitar callbacks (que introducen any en tipos externos) y pasar lint estricto.
interface SafeCorsOptions {
  origin?: boolean | string | RegExp | (string | RegExp)[];
  credentials?: boolean;
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
}

async function bootstrap() {
  // HTTPS opcional en desarrollo/entornos locales
  const useHttps = process.env.HTTPS_ENABLE === 'true';
  const app = await (async () => {
    if (useHttps) {
      try {
        const keyPath = process.env.HTTPS_KEY_PATH || '';
        const certPath = process.env.HTTPS_CERT_PATH || '';
        if (
          keyPath &&
          certPath &&
          fs.existsSync(keyPath) &&
          fs.existsSync(certPath)
        ) {
          return await NestFactory.create(AppModule, {
            httpsOptions: {
              key: fs.readFileSync(keyPath),
              cert: fs.readFileSync(certPath),
            },
          });
        }
        // Si faltan archivos, cae a HTTP
      } catch (e) {
        console.warn('Fallo iniciando HTTPS. Se usará HTTP. Motivo:', e);
      }
    }
    return await NestFactory.create(AppModule);
  })();

  // Cookies firmadas (p.ej. para CSRF o flags)
  app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-secret'));

  // Normaliza y tipa el valor de SameSite desde variables de entorno para evitar asignaciones inseguras
  type SameSiteOption = true | false | 'lax' | 'strict' | 'none';
  const resolveSameSite = (input?: string): SameSiteOption => {
    if (!input) return 'lax';
    const v = input.toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'lax' || v === 'strict' || v === 'none') return v;
    return 'lax';
  };

  // Sesión para PKCE/state/nonce (usa Redis en prod si está configurado)
  let sessionStore: session.Store | undefined;
  if (process.env.SESSION_STORE === 'redis' && process.env.REDIS_URL) {
    try {
      const redisClient: RedisClientType = createClient({
        url: process.env.REDIS_URL,
      });
      await redisClient.connect();
      const RedisStoreTyped = RedisStore as unknown as new (opts: {
        client: RedisClientType;
        prefix?: string;
        ttl?: number;
        disableTouch?: boolean;
      }) => session.Store;
      sessionStore = new RedisStoreTyped({
        client: redisClient,
        prefix: 'bff:sess:',
        ttl: 15 * 60, // 15 min: suficiente para PKCE/state/nonce
        disableTouch: true, // no refrescar TTL en cada request
      });
    } catch (e) {
      console.warn('Redis no disponible, usando MemoryStore. Motivo:', e);
    }
  }

  // No permitir SameSite=None sin Secure en cookies de sesión (Chrome las rechaza)
  const sessionSecure = process.env.NODE_ENV === 'production';
  let sessionSameSite: SameSiteOption = resolveSameSite(process.env.SAMESITE);
  if (
    !sessionSecure &&
    sessionSameSite === 'none' &&
    process.env.ALLOW_DEV_SAMESITE_NONE_SESSION !== 'true'
  ) {
    // En desarrollo, forzamos Lax salvo que se habilite override explícito
    sessionSameSite = 'lax';
  }

  app.use(
    session({
      name: 'bff_sess',
      store: sessionStore,
      secret: process.env.SESSION_SECRET || 'dev-session',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: sessionSecure,
        sameSite: sessionSameSite,
        maxAge: 15 * 60 * 1000,
      },
    }),
  );

  // Aumentar límite del body parser para requests grandes (Tracking V2 events, etc.)
  app.use(
    bodyParser.json({
      limit: '10mb',
      strict: false,
    }),
  );

  // Prefijo global: excluir docs, spec público y jwks
  app.setGlobalPrefix('api', {
    exclude: ['/docs', '/docs-json', '/jwks', '/public/openapi.json'],
  });

  // Configurar validación global para DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remueve propiedades no definidas en el DTO
      forbidNonWhitelisted: true, // Lanza error si hay propiedades no permitidas
      transform: true, // Transforma tipos automáticamente
      transformOptions: {
        enableImplicitConversion: true, // Convierte tipos implícitamente
      },
    }),
  );

  // CORS: configuración explícita para soportar cookies (credentials: true) sin abrir todo (*)
  // Problema original: uso directo de app.use(cors({...})) o origin:true podía provocar orígenes no deseados.
  //
  // Story 3.3 — Epic 3: Cross-Frame Auth Handshake.
  //
  // Estrategia (4 fuentes; 1-3 estáticas, 4 dinámica por alta de cliente):
  // 1. DEFAULT_EMBED_ORIGINS (hardcoded — LeadCars production, ver cors-origins.util.ts)
  // 2. EMBED_ALLOWED_DEFAULT_ORIGINS env var (NUEVA — spec Story 3.3 AC1)
  // 3. CORS_ALLOWED_ORIGINS env var (LEGACY — backward compat)
  // 4. company_sites.domain (Admin → nuevo cliente; sin tocar .env)
  //
  // Ejemplo:
  //   EMBED_ALLOWED_DEFAULT_ORIGINS="https://app.partner-a.com,https://app.partner-b.com"
  //   CORS_ALLOWED_ORIGINS="http://localhost:8082"
  const embedEnvOrigins = parseAllowedOrigins(
    process.env.EMBED_ALLOWED_DEFAULT_ORIGINS,
  );
  const legacyEnvOrigins = parseAllowedOrigins(
    process.env.CORS_ALLOWED_ORIGINS,
  );
  const parsedAllowed: string[] = mergeAllowedOrigins(
    embedEnvOrigins,
    legacyEnvOrigins,
  );

  // Log final allowlist for ops visibility (only on startup, not per-request)
  if (parsedAllowed.length > 0) {
    console.log(
      `[CORS] Allowed origins (${parsedAllowed.length}): ${parsedAllowed.join(', ')}`,
    );
  }

  const isDevLike =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const corsMethods: ReadonlyArray<string> = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'OPTIONS',
  ];
  // Story 3.3 AC1: required headers per spec. X-Api-Key is the canonical
  // casing per HTTP convention (RFC 7230 allows case-insensitive but tools
  // like Swagger UI and Postman expect this exact casing).
  const corsAllowedHeaders: ReadonlyArray<string> = [
    'Content-Type',
    'Authorization',
    'Cookie',
    'X-Requested-With',
    'X-Api-Key',
    'X-Guiders-Sid',
    // Admin/Console BFF: distingue cookie admin_session vs console_session
    'X-Guiders-App',
  ];
  const corsExposedHeaders: ReadonlyArray<string> = ['Set-Cookie'];
  const baseCors: SafeCorsOptions = {
    credentials: true,
    methods: [...corsMethods],
    allowedHeaders: [...corsAllowedHeaders],
    exposedHeaders: [...corsExposedHeaders],
  };

  if (parsedAllowed.length > 0) {
    // Validación estricta con callback tipado (necesario para entornos cross-origin con cookies)
    const corsDebug = process.env.CORS_DEBUG === 'true';
    const corsSiteOrigin = app.get(CorsSiteOriginService);
    const originFn: NonNullable<CorsOptions['origin']> = (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        if (corsDebug) console.log('[CORS] Sin header Origin -> permitido');
        callback(null, true); // peticiones sin header Origin (curl / SSR interno)
        return;
      }
      if (parsedAllowed.includes(origin)) {
        if (corsDebug) console.log(`[CORS] Origen permitido: ${origin}`);
        callback(null, true);
        return;
      }
      void corsSiteOrigin.isRegisteredSiteOrigin(origin).then(
        (allowed) => {
          if (allowed) {
            if (corsDebug)
              console.log(`[CORS] Origen permitido (site): ${origin}`);
            callback(null, true);
            return;
          }
          if (corsDebug) console.warn(`[CORS] Origen denegado: ${origin}`);
          callback(new Error(`Origen no permitido por CORS: ${origin}`));
        },
        () => {
          if (corsDebug) console.warn(`[CORS] Origen denegado: ${origin}`);
          callback(new Error(`Origen no permitido por CORS: ${origin}`));
        },
      );
    };
    app.enableCors({
      ...baseCors,
      origin: originFn,
    } as CorsOptions);
  } else if (isDevLike) {
    // Desarrollo abierto (solo para DX). NO usar en producción con cookies cross-site.
    app.enableCors({ ...baseCors, origin: true } as CorsOptions);
  }

  // Documentación OpenAPI
  // - Documento completo (interno): usado por Scalar UI y /docs-json
  // - Documento público filtrado: servido en /public/openapi.json sin auth
  const document = createOpenApiDocument(app);
  const publicDocument = createPublicOpenApiDocument(app);

  // Scalar UI en /docs (reemplaza Swagger UI).
  // /docs coincide con cualquier subruta: /docs/leadcars queda cerrado.
  const { apiReference } = await import('@scalar/nestjs-api-reference');
  app.use('/docs/leadcars', (_req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });
  app.use(
    '/docs',
    apiReference({
      spec: { content: document },
      theme: 'default',
      metaData: {
        title: 'Guiders API Docs',
        description: 'Documentación oficial de la API de Guiders',
      },
    }),
  );

  // Spec JSON completo en /docs-json (compatibilidad con herramientas existentes)
  SwaggerModule.setup('docs-json-raw', app, document);

  // Spec público sin autenticación — accesible por LLMs, Postman, integradores externos
  // CORS abierto para este endpoint específico
  const expressApp = app.getHttpAdapter().getInstance() as {
    get: (
      path: string,
      handler: (
        req: unknown,
        res: {
          json: (data: unknown) => void;
          setHeader: (key: string, value: string) => void;
        },
      ) => void,
    ) => void;
  };
  expressApp.get('/public/openapi.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
    res.json(publicDocument);
  });

  // Configuración adicional para WebSockets y proxy reverso
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const logger = new Logger('bootstrap');
  logger.log(
    `Application is running in ${process.env.NODE_ENV || 'development'} mode`,
  );
  logger.log(
    `Global prefix: api (excluded: /docs, /docs-json, /jwks, /public/openapi.json)`,
  );

  const port = process.env.PORT ?? 3000;
  const protocol = useHttps ? 'https' : 'http';

  logger.log(`Application is running on ${protocol}://0.0.0.0:${port}`);
  logger.log(`Scalar docs at: ${protocol}://localhost:${port}/docs`);
  logger.log(
    `OpenAPI spec (internal) at: ${protocol}://localhost:${port}/docs-json`,
  );
  logger.log(
    `OpenAPI spec (public) at: ${protocol}://localhost:${port}/public/openapi.json`,
  );

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
// Se invoca bootstrap y se maneja la promesa correctamente para evitar warnings de promesas no gestionadas
bootstrap().catch((err) => {
  // Se registra el error en caso de fallo en el arranque
  console.error('Error during bootstrap:', err);
});
