#!/usr/bin/env node
// tools/cli.ts
import { config } from 'dotenv';
import { resolve } from 'path';

// Selección dinámica del archivo .env según NODE_ENV
// production -> .env.production
// staging -> .env.staging
// cualquier otro -> .env (por defecto desarrollo/local)
const envFile =
  process.env.NODE_ENV === 'production'
    ? '.env.production'
    : process.env.NODE_ENV === 'staging'
      ? '.env.staging'
      : '.env';
config({ path: resolve(__dirname, '..', '..', envFile) });

import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CommandBus, EventPublisher } from '@nestjs/cqrs';
import { CreateCompanyCommand } from '../src/context/company/application/commands/create-company.command';
import { CreateCompanyWithAdminCommand } from '../src/context/company/application/commands/create-company-with-admin.command';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../src/context/company/domain/company.repository';
import {
  VISITOR_V2_REPOSITORY,
  VisitorV2Repository,
} from '../src/context/visitors-v2/domain/visitor-v2.repository';
import { VisitorV2 } from '../src/context/visitors-v2/domain/visitor-v2.aggregate';
import { VisitorId } from '../src/context/visitors-v2/domain/value-objects/visitor-id';
import { TenantId } from '../src/context/visitors-v2/domain/value-objects/tenant-id';
import { SiteId } from '../src/context/visitors-v2/domain/value-objects/site-id';
import { VisitorFingerprint } from '../src/context/visitors-v2/domain/value-objects/visitor-fingerprint';
import {
  VisitorLifecycle,
  VisitorLifecycleVO,
} from '../src/context/visitors-v2/domain/value-objects/visitor-lifecycle';
import {
  API_KEY_REPOSITORY,
  ApiKeyRepository,
} from '../src/context/auth/api-key/domain/repository/api-key.repository';
import { ApiKeyCompanyId } from '../src/context/auth/api-key/domain/model/api-key-company-id';
import { CreateApiKeyForDomainUseCase } from '../src/context/auth/api-key/application/usecase/create-api-key-for-domain.usecase';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from '../src/context/auth/auth-user/domain/user-account.repository';
import { UserAccount } from '../src/context/auth/auth-user/domain/user-account.aggregate';
import { UserAccountId } from '../src/context/auth/auth-user/domain/user-account-id';
import { UserAccountEmail } from '../src/context/auth/auth-user/domain/user-account-email';
import { UserAccountName } from '../src/context/auth/auth-user/domain/value-objects/user-account-name';
import { UserAccountPassword } from '../src/context/auth/auth-user/domain/user-account-password';
import { UserAccountRoles } from '../src/context/auth/auth-user/domain/value-objects/user-account-roles';
import { Role } from '../src/context/auth/auth-user/domain/value-objects/role';
import { UserAccountCompanyId } from '../src/context/auth/auth-user/domain/value-objects/user-account-company-id';
import { UserAccountKeycloakId } from '../src/context/auth/auth-user/domain/value-objects/user-account-keycloak-id';
import {
  USER_PASSWORD_HASHER,
  UserPasswordHasher,
} from '../src/context/auth/auth-user/application/service/user-password-hasher';
import { Uuid } from '../src/context/shared/domain/value-objects/uuid';
import {
  LEAD_CONTACT_DATA_REPOSITORY,
  ILeadContactDataRepository,
} from '../src/context/leads/domain/lead-contact-data.repository';
import { meetsLeadCriteria } from '../src/context/leads/application/commands/save-lead-contact-data-command.handler';

const program = new Command();

program
  .command('hello')
  .description('Muestra un saludo')
  .action(async () => {
    const app = await NestFactory.createApplicationContext(AppModule);
    console.log('Hola desde CLI');
    await app.close();
  });

program
  .command('create-company')
  .description('Crea una nueva compañía desde CLI')
  .requiredOption('--name <companyName>', 'Nombre de la compañía')
  .requiredOption('--domain <domain>', 'Dominio canónico de la compañía')
  .option('--aliases <aliases>', 'Dominios alias separados por comas (opcional)')
  .option(
    '--site-name <siteName>',
    'Nombre del sitio (opcional, por defecto "Sitio Principal")',
  )
  .action(async (options: Record<string, string>) => {
    const app = await NestFactory.createApplicationContext(AppModule);
    const commandBus = app.get(CommandBus);

    // Procesar aliases si existen
    const domainAliases = options.aliases
      ? options.aliases
          .split(',')
          .map((alias) => alias.trim())
          .filter((alias) => alias.length > 0)
      : [];

    // Construye el DTO con la nueva estructura de sites
    const createCompanyDto = {
      companyName: String(options.name),
      sites: [
        {
          id: '', // Se generará automáticamente en el domain
          name: options.siteName || 'Sitio Principal',
          canonicalDomain: String(options.domain),
          domainAliases: domainAliases,
        },
      ],
    };
    
    await commandBus.execute(new CreateCompanyCommand(createCompanyDto));
    console.log('Compañía creada correctamente');
    console.log(`- Nombre: ${options.name}`);
    console.log(`- Dominio canónico: ${options.domain}`);
    if (domainAliases.length > 0) {
      console.log(`- Aliases: ${domainAliases.join(', ')}`);
    }
    await app.close();
  });

program
  .command('create-company-with-admin')
  .description('Crea una nueva compañía y su admin desde CLI')
  .requiredOption('--name <companyName>', 'Nombre de la compañía')
  .requiredOption('--domain <domain>', 'Dominio canónico de la compañía')
  .requiredOption('--adminName <adminName>', 'Nombre del administrador')
  .requiredOption('--adminEmail <adminEmail>', 'Email del administrador')
  .option('--adminTel <adminTel>', 'Teléfono del administrador')
  .option(
    '--aliases <aliases>',
    'Dominios alias separados por comas (opcional)',
  )
  .option(
    '--site-name <siteName>',
    'Nombre del sitio (opcional, por defecto "Sitio Principal")',
  )
  .action(async (options: Record<string, string>) => {
    const app = await NestFactory.createApplicationContext(AppModule);
    const commandBus = app.get(CommandBus);

    // Procesar aliases si existen
    const domainAliases = options.aliases
      ? options.aliases
          .split(',')
          .map((alias) => alias.trim())
          .filter((alias) => alias.length > 0)
      : [];

    // Construye el comando con la nueva estructura de sites
    const command = new CreateCompanyWithAdminCommand({
      adminName: String(options.adminName),
      adminEmail: String(options.adminEmail),
      adminTel: options.adminTel ? String(options.adminTel) : undefined,
      companyName: String(options.name),
      sites: [
        {
          id: '', // Se generará automáticamente
          name: options.siteName || 'Sitio Principal',
          canonicalDomain: String(options.domain),
          domainAliases: domainAliases,
        },
      ],
    });
    
    await commandBus.execute(command);
    // Espera explícita para asegurar que los eventos de dominio CQRS se procesen correctamente
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Ajusta el tiempo según sea necesario
    console.log('Compañía y admin creados correctamente');
    console.log(`- Empresa: ${options.name}`);
    console.log(`- Dominio canónico: ${options.domain}`);
    if (domainAliases.length > 0) {
      console.log(`- Aliases: ${domainAliases.join(', ')}`);
    }
    console.log(`- Admin: ${options.adminName} (${options.adminEmail})`);
    await app.close();
  });

program
  .command('clean-database')
  .description('Limpia todas las entidades de la base de datos')
  .option('--force', 'Fuerza la limpieza sin confirmación')
  .action(async (options: { force?: boolean }) => {
    if (!options.force) {
      console.log(
        '⚠️  ADVERTENCIA: Esta operación eliminará TODOS los datos de la base de datos.',
      );
      console.log('Para ejecutar, añade la opción --force');
      return;
    }

    const logger = new Logger('CleanDatabase');
    logger.log('Iniciando limpieza de la base de datos...');

    try {
      const app = await NestFactory.createApplicationContext(AppModule);
      const dataSource = app.get(DataSource);

      if (!dataSource.isInitialized) {
        await dataSource.initialize();
        logger.log('Conexión a la base de datos inicializada');
      }

      // Obtener todas las entidades registradas
      const entities = dataSource.entityMetadatas;

      // Desactivar restricciones de clave foránea temporalmente
      await dataSource.query('SET CONSTRAINTS ALL DEFERRED');

      // Truncar todas las tablas en orden inverso (para evitar problemas de dependencia)
      for (const entity of entities.reverse()) {
        try {
          logger.log(`Limpiando entidad: ${entity.name}`);
          await dataSource.query(`TRUNCATE TABLE ${entity.tableName} CASCADE`);
          logger.log(`Entidad ${entity.name} limpiada correctamente`);
        } catch (error: any) {
          logger.error(
            `Error al limpiar la entidad ${entity.name}: ${error?.message || 'Error desconocido'}`,
          );
        }
      }

      // Reactivar restricciones de clave foránea
      await dataSource.query('SET CONSTRAINTS ALL IMMEDIATE');

      logger.log('🧹 Base de datos limpiada correctamente');
      await app.close();
    } catch (error: any) {
      logger.error(
        `Error al limpiar la base de datos: ${error?.message || 'Error desconocido'}`,
      );
      process.exit(1);
    }
  });

program
  .command('clean-mongodb')
  .description('Limpia todas las colecciones de MongoDB (chats y mensajes)')
  .option('--force', 'Fuerza la limpieza sin confirmación')
  .action(async (options: { force?: boolean }) => {
    if (!options.force) {
      console.log(
        '⚠️  ADVERTENCIA: Esta operación eliminará TODOS los chats y mensajes de MongoDB.',
      );
      console.log('Para ejecutar, añade la opción --force');
      return;
    }

    const logger = new Logger('CleanMongoDB');
    logger.log('Iniciando limpieza de MongoDB...');

    try {
      const app = await NestFactory.createApplicationContext(AppModule);

      // Obtener la conexión de MongoDB
      const mongoConnection = app.get(getConnectionToken());

      if (!mongoConnection) {
        throw new Error('No se pudo obtener la conexión de MongoDB');
      }

      logger.log('Conexión a MongoDB obtenida correctamente');

      // Verificar que la base de datos esté disponible
      if (!mongoConnection.db) {
        throw new Error('Base de datos MongoDB no disponible');
      }

      // Obtener todas las colecciones
      const collections = await mongoConnection.db.collections();

      logger.log(`Encontradas ${collections.length} colecciones en MongoDB`);

      // Limpiar cada colección
      for (const collection of collections) {
        try {
          const collectionName = collection.collectionName;
          logger.log(`Limpiando colección: ${collectionName}`);

          const result = await collection.deleteMany({});
          logger.log(
            `Colección ${collectionName} limpiada: ${result.deletedCount} documentos eliminados`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Error desconocido';
          logger.error(
            `Error al limpiar la colección ${collection.collectionName}: ${errorMessage}`,
          );
        }
      }

      logger.log('🧹 MongoDB limpiado correctamente');
      await app.close();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      logger.error(`Error al limpiar MongoDB: ${errorMessage}`);
      process.exit(1);
    }
  });

program
  .command('seed-e2e-company')
  .description(
    'Limpia el entorno y genera una empresa completa para tests E2E del frontend con muchos visitantes ficticios',
  )
  .option('--name <companyName>', 'Nombre de la empresa', 'E2E Test Company')
  .option('--domain <domain>', 'Dominio canónico', 'e2e.guiders.local')
  .option(
    '--aliases <aliases>',
    'Aliases de dominio separados por comas',
    'www.e2e.guiders.local,staging.e2e.guiders.local',
  )
  .option('--admin-name <adminName>', 'Nombre del admin', 'E2E Admin')
  .option(
    '--admin-email <adminEmail>',
    'Email del admin',
    'e2e-admin@guiders.test',
  )
  .option('--admin-tel <adminTel>', 'Teléfono del admin', '+34600000000')
  .option(
    '--visitors <count>',
    'Cantidad de visitantes ficticios a crear',
    '150',
  )
  .option('--skip-clean', 'No limpiar el entorno antes de sembrar', false)
  .action(
    async (options: {
      name: string;
      domain: string;
      aliases: string;
      adminName: string;
      adminEmail: string;
      adminTel: string;
      visitors: string;
      skipClean?: boolean;
    }) => {
      const logger = new Logger('SeedE2ECompany');
      const visitorCount = Math.max(1, parseInt(options.visitors, 10) || 150);

      const app = await NestFactory.createApplicationContext(AppModule);

      try {
        // =====================================================================
        // 1. LIMPIEZA DEL ENTORNO ANTERIOR
        // =====================================================================
        if (!options.skipClean) {
          logger.log('🧹 Iniciando limpieza del entorno anterior...');

          // PostgreSQL
          const dataSource = app.get(DataSource);
          if (!dataSource.isInitialized) {
            await dataSource.initialize();
          }
          const entities = dataSource.entityMetadatas;
          await dataSource.query('SET CONSTRAINTS ALL DEFERRED');
          for (const entity of [...entities].reverse()) {
            try {
              await dataSource.query(
                `TRUNCATE TABLE "${entity.tableName}" CASCADE`,
              );
            } catch (error) {
              logger.warn(
                `No se pudo truncar ${entity.tableName}: ${(error as Error).message}`,
              );
            }
          }
          await dataSource.query('SET CONSTRAINTS ALL IMMEDIATE');
          logger.log('✅ PostgreSQL limpiado');

          // MongoDB
          try {
            const mongoConnection = app.get<Connection>(getConnectionToken());
            if (mongoConnection?.db) {
              const collections = await mongoConnection.db.collections();
              for (const collection of collections) {
                try {
                  await collection.deleteMany({});
                } catch (error) {
                  logger.warn(
                    `No se pudo limpiar colección ${collection.collectionName}: ${(error as Error).message}`,
                  );
                }
              }
              logger.log(
                `✅ MongoDB limpiado (${collections.length} colecciones)`,
              );
            }
          } catch (error) {
            logger.warn(
              `MongoDB no disponible o ya limpio: ${(error as Error).message}`,
            );
          }
        } else {
          logger.log('⏭️  Limpieza omitida (--skip-clean activo)');
        }

        // =====================================================================
        // 2. CREAR EMPRESA + ADMIN
        // =====================================================================
        logger.log(
          `🏢 Creando empresa "${options.name}" (${options.domain})...`,
        );

        const commandBus = app.get(CommandBus);
        const aliases = options.aliases
          .split(',')
          .map((a) => a.trim())
          .filter((a) => a.length > 0);

        await commandBus.execute(
          new CreateCompanyWithAdminCommand({
            companyName: options.name,
            adminName: options.adminName,
            adminEmail: options.adminEmail,
            adminTel: options.adminTel,
            sites: [
              {
                id: '',
                name: 'Sitio E2E Principal',
                canonicalDomain: options.domain,
                domainAliases: aliases,
              },
            ],
          }),
        );

        // Esperar a que los handlers asíncronos (API keys, user creation, invites) terminen
        logger.log('⏳ Esperando procesamiento de eventos de dominio...');
        await new Promise((r) => setTimeout(r, 15000));

        // =====================================================================
        // 3. RECUPERAR DATOS DE LA EMPRESA
        // =====================================================================
        const companyRepository =
          app.get<CompanyRepository>(COMPANY_REPOSITORY);
        const companyResult = await companyRepository.findByDomain(
          options.domain,
        );
        if (companyResult.isErr()) {
          throw new Error(
            `No se pudo recuperar la empresa recién creada: ${companyResult.error.message}`,
          );
        }
        const company = companyResult.value;
        const companyId = company.getId().value;
        const sites = company.getSites().toPrimitives();
        const primarySite = sites[0];

        logger.log(`✅ Empresa creada: ${companyId}`);
        logger.log(`   - Site ID: ${primarySite.id}`);
        logger.log(`   - Dominio: ${primarySite.canonicalDomain}`);

        // Recuperar API keys generadas automáticamente
        const apiKeyRepository =
          app.get<ApiKeyRepository>(API_KEY_REPOSITORY);
        const apiKeys = await apiKeyRepository.getApiKeysByCompanyId(
          ApiKeyCompanyId.create(companyId),
        );
        if (apiKeys.length === 0) {
          logger.warn(
            '⚠️  No se encontraron API keys generadas. El frontend podría no autenticar.',
          );
        } else {
          logger.log(`🔑 API keys generadas: ${apiKeys.length}`);
          apiKeys.forEach((k) => {
            logger.log(
              `   - ${k.domain.getValue()}: ${k.apiKey.getValue()}`,
            );
          });
        }

        // =====================================================================
        // 3.5. CREAR USUARIO ADMIN CON CONTRASEÑA
        // =====================================================================
        const adminPassword = 'E2eAdmin123!';
        const userRepository =
          app.get<UserAccountRepository>(USER_ACCOUNT_REPOSITORY);
        const hasher = app.get<UserPasswordHasher>(USER_PASSWORD_HASHER);
        const publisher = app.get(EventPublisher);

        let adminExists = await userRepository.findByEmail(options.adminEmail);
        if (!adminExists) {
          logger.log(
            `👤 Usuario admin no creado por handlers async, creándolo directamente...`,
          );
          const hashedPassword = await hasher.hash(adminPassword);
          const adminUser = UserAccount.create({
            id: UserAccountId.create(Uuid.random().value),
            email: UserAccountEmail.create(options.adminEmail),
            name: new UserAccountName(options.adminName),
            password: new UserAccountPassword(hashedPassword),
            roles: UserAccountRoles.create([Role.admin()]),
            companyId: UserAccountCompanyId.create(companyId),
          });
          const adminContext = publisher.mergeObjectContext(adminUser);
          await userRepository.save(adminContext);
          adminContext.commit();
          logger.log(`✅ Admin creado: ${options.adminEmail}`);
        } else {
          logger.log(
            `✅ Admin ya existe en BD: ${options.adminEmail} — actualizando contraseña...`,
          );
          const hashedPassword = await hasher.hash(adminPassword);
          const updated = adminExists.updatePassword(hashedPassword);
          const updatedContext = publisher.mergeObjectContext(updated);
          await userRepository.save(updatedContext);
          updatedContext.commit();
        }
        logger.log(`🔐 Contraseña admin: ${adminPassword}`);

        // =====================================================================
        // 3.6. CREAR USUARIO ADMIN EN KEYCLOAK Y VINCULAR CON BD
        // =====================================================================
        const keycloakUrl =
          process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
        const keycloakRealm = process.env.KEYCLOAK_REALM ?? 'guiders';
        const keycloakAdminUser =
          process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin';
        const keycloakAdminPass =
          process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin123';

        try {
          // 3.6.1 Obtener token de admin de Keycloak
          const tokenRes = await fetch(
            `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                grant_type: 'password',
                client_id: 'admin-cli',
                username: keycloakAdminUser,
                password: keycloakAdminPass,
              }),
            },
          );

          if (!tokenRes.ok) {
            throw new Error(
              `Keycloak admin token failed: ${tokenRes.status} ${await tokenRes.text()}`,
            );
          }

          const { access_token: kcToken } = (await tokenRes.json()) as {
            access_token: string;
          };
          const kcHeaders = {
            Authorization: `Bearer ${kcToken}`,
            'Content-Type': 'application/json',
          };
          const kcBase = `${keycloakUrl}/admin/realms/${keycloakRealm}`;

          // 3.6.2 Verificar si el usuario ya existe en Keycloak
          const searchRes = await fetch(
            `${kcBase}/users?email=${encodeURIComponent(options.adminEmail)}&exact=true`,
            { headers: kcHeaders },
          );
          const existingKcUsers = (await searchRes.json()) as { id: string }[];

          let keycloakUserId: string;

          if (existingKcUsers.length > 0) {
            keycloakUserId = existingKcUsers[0].id;
            logger.log(
              `♻️  Usuario Keycloak ya existe (${keycloakUserId}), reutilizando...`,
            );
          } else {
            // 3.6.3 Crear usuario en Keycloak
            const createRes = await fetch(`${kcBase}/users`, {
              method: 'POST',
              headers: kcHeaders,
              body: JSON.stringify({
                username: options.adminEmail,
                email: options.adminEmail,
                firstName: options.adminName.split(' ')[0] ?? options.adminName,
                lastName: options.adminName.split(' ').slice(1).join(' ') || '',
                enabled: true,
                emailVerified: true,
              }),
            });

            if (!createRes.ok) {
              throw new Error(
                `Error creando usuario en Keycloak: ${createRes.status} ${await createRes.text()}`,
              );
            }

            // El ID del usuario nuevo está en el header Location
            const location = createRes.headers.get('location') ?? '';
            keycloakUserId = location.split('/').pop() ?? '';
            if (!keycloakUserId) {
              throw new Error(
                'No se pudo obtener el ID del usuario creado en Keycloak',
              );
            }
            logger.log(`✅ Usuario creado en Keycloak: ${keycloakUserId}`);
          }

          // 3.6.4 Establecer contraseña permanente en Keycloak
          const pwRes = await fetch(
            `${kcBase}/users/${keycloakUserId}/reset-password`,
            {
              method: 'PUT',
              headers: kcHeaders,
              body: JSON.stringify({
                type: 'password',
                value: adminPassword,
                temporary: false,
              }),
            },
          );

          if (!pwRes.ok) {
            throw new Error(
              `Error estableciendo contraseña en Keycloak: ${pwRes.status} ${await pwRes.text()}`,
            );
          }
          logger.log(`🔑 Contraseña establecida en Keycloak`);

          // 3.6.5 Asignar rol "administrator" en Keycloak (client role del realm)
          // Buscar el rol "administrator" en realm-level roles
          const rolesRes = await fetch(`${kcBase}/roles`, {
            headers: kcHeaders,
          });
          const allRoles = (await rolesRes.json()) as {
            id: string;
            name: string;
          }[];
          const adminRole = allRoles.find(
            (r) => r.name === 'administrator' || r.name === 'admin',
          );
          if (adminRole) {
            await fetch(`${kcBase}/users/${keycloakUserId}/role-mappings/realm`, {
              method: 'POST',
              headers: kcHeaders,
              body: JSON.stringify([{ id: adminRole.id, name: adminRole.name }]),
            });
            logger.log(`✅ Rol "${adminRole.name}" asignado en Keycloak`);
          } else {
            logger.warn(
              `⚠️  No se encontró rol "administrator"/"admin" en Keycloak — el usuario se creó sin rol`,
            );
          }

          // 3.6.6 Vincular usuario de BD con Keycloak ID
          const adminUserInDb = await userRepository.findByEmail(
            options.adminEmail,
          );
          if (adminUserInDb && !adminUserInDb.isLinkedWithKeycloak()) {
            const { UserAccountKeycloakId } = await import(
              '../src/context/auth/auth-user/domain/value-objects/user-account-keycloak-id'
            );
            const linked = adminUserInDb.linkWithKeycloak(
              UserAccountKeycloakId.fromString(keycloakUserId),
            );
            const linkedCtx = publisher.mergeObjectContext(linked);
            await userRepository.save(linkedCtx);
            linkedCtx.commit();
            logger.log(`🔗 Usuario BD vinculado con Keycloak ID ${keycloakUserId}`);
          }
        } catch (kcError) {
          logger.warn(
            `⚠️  No se pudo crear/configurar usuario en Keycloak: ${kcError instanceof Error ? kcError.message : String(kcError)}`,
          );
          logger.warn(
            `   El usuario existe en la BD pero NO en Keycloak. Login SSO no funcionará.`,
          );
        }

        // =====================================================================
        // 4. GENERAR VISITANTES FICTICIOS
        // =====================================================================
        logger.log(`👥 Creando ${visitorCount} visitantes ficticios...`);

        const visitorRepository = app.get<VisitorV2Repository>(
          VISITOR_V2_REPOSITORY,
        );

        const tenantId = new TenantId(companyId);
        const siteId = new SiteId(primarySite.id);

        const lifecycles = [
          VisitorLifecycle.ANON,
          VisitorLifecycle.ENGAGED,
          VisitorLifecycle.LEAD,
          VisitorLifecycle.CONVERTED,
        ];

        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/121.0',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        ];

        const urls = [
          `https://${options.domain}/`,
          `https://${options.domain}/products`,
          `https://${options.domain}/pricing`,
          `https://${options.domain}/contact`,
          `https://${options.domain}/blog/post-1`,
          `https://${options.domain}/about`,
          `https://${options.domain}/checkout`,
        ];

        const randomIp = () =>
          `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
        const pick = <T>(arr: T[]): T =>
          arr[Math.floor(Math.random() * arr.length)];
        const randomFingerprint = () =>
          `fp-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

        let created = 0;
        let failed = 0;

        const BATCH = 25;
        for (let i = 0; i < visitorCount; i += BATCH) {
          const batch = Math.min(BATCH, visitorCount - i);
          const promises: Promise<void>[] = [];

          for (let j = 0; j < batch; j++) {
            const idx = i + j;
            const lifecycle = pick(lifecycles);
            const isInternal = idx % 50 === 0; // ~2% comerciales internos
            const ua = pick(userAgents);
            const ip = randomIp();

            const visitor = VisitorV2.create({
              id: VisitorId.random(),
              tenantId,
              siteId,
              fingerprint: new VisitorFingerprint(randomFingerprint()),
              lifecycle: new VisitorLifecycleVO(VisitorLifecycle.ANON),
              hasAcceptedPrivacyPolicy: true,
              consentVersion: '1.0.0',
              isInternal,
              ipAddress: ip,
              userAgent: ua,
            });

            // Transición progresiva de lifecycle (respetando reglas del agregado)
            try {
              if (
                lifecycle === VisitorLifecycle.ENGAGED ||
                lifecycle === VisitorLifecycle.LEAD ||
                lifecycle === VisitorLifecycle.CONVERTED
              ) {
                visitor.markAsEngaged();
              }
              if (
                lifecycle === VisitorLifecycle.LEAD ||
                lifecycle === VisitorLifecycle.CONVERTED
              ) {
                visitor.convertToLead();
              }
              if (lifecycle === VisitorLifecycle.CONVERTED) {
                visitor.markAsConverted();
              }
            } catch {
              // Silenciar transiciones inválidas, mantener ANON
            }

            visitor.updateCurrentUrl(pick(urls));

            const visitorContext = publisher.mergeObjectContext(visitor);
            promises.push(
              visitorRepository
                .save(visitorContext)
                .then((res) => {
                  if (res.isErr()) {
                    failed++;
                    logger.warn(
                      `Visitante ${idx} falló: ${res.error.message}`,
                    );
                  } else {
                    visitorContext.commit();
                    created++;
                  }
                })
                .catch((e: unknown) => {
                  failed++;
                  logger.warn(
                    `Visitante ${idx} excepción: ${(e as Error).message}`,
                  );
                }),
            );
          }

          await Promise.all(promises);
          logger.log(
            `   Progreso: ${Math.min(i + batch, visitorCount)}/${visitorCount} (ok=${created}, fail=${failed})`,
          );
        }

        // =====================================================================
        // 5. RESUMEN FINAL
        // =====================================================================
        logger.log('========================================================');
        logger.log('🎉 Seed E2E completado correctamente');
        logger.log('========================================================');
        logger.log(`📦 Empresa:      ${options.name}`);
        logger.log(`🆔 Company ID:   ${companyId}`);
        logger.log(`🌐 Site ID:      ${primarySite.id}`);
        logger.log(`🌍 Dominio:      ${primarySite.canonicalDomain}`);
        if (aliases.length > 0) {
          logger.log(`🔗 Aliases:      ${aliases.join(', ')}`);
        }
        logger.log(
          `👤 Admin:        ${options.adminName} <${options.adminEmail}>`,
        );
        if (apiKeys.length > 0) {
          logger.log(`🔑 API Key principal: ${apiKeys[0].apiKey.getValue()}`);
        }
        logger.log(
          `👥 Visitantes:   ${created} creados, ${failed} fallidos (de ${visitorCount} solicitados)`,
        );
        logger.log('========================================================');
      } catch (error) {
        logger.error(
          `Error en seed E2E: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (error instanceof Error && error.stack) {
          logger.error(error.stack);
        }
        process.exit(1);
      } finally {
        await app.close();
      }
    },
  );

program
  .command('create-apikey')
  .description('Crea una API key para un dominio específico')
  .requiredOption('--domain <domain>', 'Dominio para la API key')
  .requiredOption('--company-id <companyId>', 'ID de la compañía')
  .action(async (options: Record<string, string>) => {
    const logger = new Logger('CreateApiKey');
    const app = await NestFactory.createApplicationContext(AppModule);
    const createApiKeyUseCase = app.get(CreateApiKeyForDomainUseCase);
    const { ApiKeyDomain } = await import('../src/context/auth/api-key/domain/model/api-key-domain');
    const { ApiKeyCompanyId } = await import('../src/context/auth/api-key/domain/model/api-key-company-id');

    const domain = options.domain;
    const companyId = options.companyId;

    try {
      const result = await createApiKeyUseCase.execute(
        ApiKeyDomain.create(domain),
        ApiKeyCompanyId.create(companyId),
      );
      logger.log(`API Key creada exitosamente`);
      logger.log(`  Dominio: ${domain}`);
      logger.log(`  API Key: ${result.apiKey}`);
    } catch (error) {
      logger.error(`Error creando API Key: ${error}`);
    }

    await app.close();
  });

program
  .command('get-apikeys')
  .description('Obtiene las API keys de una company')
  .requiredOption('--company-id <companyId>', 'ID de la compañía')
  .action(async (options: Record<string, string>) => {
    const logger = new Logger('GetApiKeys');
    const app = await NestFactory.createApplicationContext(AppModule);
    const apiKeyRepository = app.get<ApiKeyRepository>(API_KEY_REPOSITORY);

    const companyId = options.companyId;
    const apiKeys = await apiKeyRepository.getApiKeysByCompanyId(ApiKeyCompanyId.create(companyId));

    if (apiKeys.length === 0) {
      logger.warn('No se encontraron API keys para esta company');
    } else {
      logger.log(`API Keys encontradas: ${apiKeys.length}`);
      apiKeys.forEach((k, i) => {
        console.log(`\nAPI Key ${i + 1}:`);
        console.log(`  Dominio: ${k.domain.getValue()}`);
        console.log(`  API Key: ${k.apiKey.getValue()}`);
      });
      console.log('');
    }

    await app.close();
  });

program
  .command('create-user-from-keycloak')
  .description('Crea o actualiza un usuario en BD vinculado a Keycloak')
  .requiredOption('--keycloak-id <keycloakId>', 'ID del usuario en Keycloak')
  .requiredOption('--email <email>', 'Email del usuario')
  .requiredOption('--name <name>', 'Nombre del usuario')
  .requiredOption('--company-id <companyId>', 'ID de la compañía')
  .option('--role <role>', 'Rol del usuario', 'admin')
  .action(async (options: Record<string, string>) => {
    const logger = new Logger('CreateUserFromKeycloak');
    const app = await NestFactory.createApplicationContext(AppModule);
    const userRepository = app.get<UserAccountRepository>(USER_ACCOUNT_REPOSITORY);
    const hasher = app.get<UserPasswordHasher>(USER_PASSWORD_HASHER);
    const publisher = app.get(EventPublisher);

    const keycloakId = options.keycloakId;
    const email = options.email;
    const name = options.name;
    const companyId = options.companyId;
    const roleValue = options.role?.toUpperCase() || 'ADMIN';
    const role = roleValue === 'ADMIN' ? Role.admin() : roleValue === 'SUPERADMIN' ? Role.superadmin() : roleValue === 'COMMERCIAL' ? Role.commercial() : roleValue === 'SUPERVISOR' ? Role.supervisor() : Role.admin();

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      const existingPrimitives = existing.toPrimitives();
      logger.log(`Usuario ya existe: ${existingPrimitives.id} — actualizando vínculo Keycloak`);
      if (!existingPrimitives.keycloakId) {
        const linked = existing.linkWithKeycloak(UserAccountKeycloakId.fromString(keycloakId));
        const ctx = publisher.mergeObjectContext(linked);
        await userRepository.save(ctx);
        ctx.commit();
        logger.log(`✅ Vinculado Keycloak ID: ${keycloakId}`);
      } else {
        logger.log(`Ya tiene Keycloak ID: ${existingPrimitives.keycloakId}`);
      }
    } else {
      logger.log(`Creando usuario: ${email}`);
      const hashedPassword = await hasher.hash('SSO_NO_REQUIRES_PASSWORD');
      const user = UserAccount.create({
        id: UserAccountId.create(Uuid.random().value),
        email: UserAccountEmail.create(email),
        name: new UserAccountName(name),
        password: new UserAccountPassword(hashedPassword),
        roles: UserAccountRoles.create([role]),
        companyId: UserAccountCompanyId.create(companyId),
      });
      const linked = user.linkWithKeycloak(UserAccountKeycloakId.fromString(keycloakId));
      const context = publisher.mergeObjectContext(linked);
      await userRepository.save(context);
      context.commit();
      const createdPrimitives = linked.toPrimitives();
      logger.log(`✅ Usuario creado: ${createdPrimitives.id}`);
      logger.log(`   Keycloak ID: ${keycloakId}`);
      logger.log(`   Company ID: ${companyId}`);
    }

    await app.close();
  });

program
  .command('promote-leads-from-contact-data')
  .description(
    'Promueve a LEAD visitors ANON/ENGAGED que ya tienen nombre + (email o teléfono) en contacto',
  )
  .option(
    '--company-id <companyId>',
    'Limitar a una compañía (si se omite, procesa todas)',
  )
  .option('--dry-run', 'Solo listar candidatos sin guardar', false)
  .action(async (options: { companyId?: string; dryRun?: boolean }) => {
    const logger = new Logger('PromoteLeadsFromContactData');
    const app = await NestFactory.createApplicationContext(AppModule);
    const contactRepo = app.get<ILeadContactDataRepository>(
      LEAD_CONTACT_DATA_REPOSITORY,
    );
    const visitorRepo = app.get<VisitorV2Repository>(VISITOR_V2_REPOSITORY);
    const publisher = app.get(EventPublisher);
    const companyRepo = app.get<CompanyRepository>(COMPANY_REPOSITORY);

    const companyIds: string[] = [];
    if (options.companyId) {
      companyIds.push(options.companyId);
    } else {
      const companiesResult = await companyRepo.findAll();
      if (companiesResult.isErr()) {
        throw companiesResult.error;
      }
      for (const company of companiesResult.unwrap()) {
        companyIds.push(company.toPrimitives().id);
      }
    }

    let promoted = 0;
    let skipped = 0;
    let errors = 0;

    for (const companyId of companyIds) {
      logger.log(`Procesando company ${companyId}...`);
      const contactsResult = await contactRepo.findByCompanyId(companyId);
      if (contactsResult.isErr()) {
        logger.error(
          `Error listando contactos de ${companyId}: ${contactsResult.error.message}`,
        );
        errors++;
        continue;
      }

      const contacts = contactsResult.unwrap().filter(meetsLeadCriteria);
      logger.log(
        `  Candidatos con criterio Lead: ${contacts.length} (de ${contactsResult.unwrap().length} contactos)`,
      );

      for (const contact of contacts) {
        const visitorResult = await visitorRepo.findById(
          VisitorId.create(contact.visitorId),
        );
        if (visitorResult.isErr()) {
          logger.warn(`  Visitor no encontrado: ${contact.visitorId}`);
          skipped++;
          continue;
        }

        const visitor = visitorResult.unwrap();
        if (
          !visitor.getLifecycle().isAnon() &&
          !visitor.getLifecycle().isEngaged()
        ) {
          skipped++;
          continue;
        }

        if (options.dryRun) {
          logger.log(
            `  [dry-run] Promovería ${contact.visitorId} (${contact.nombre} / ${contact.email ?? contact.telefono})`,
          );
          promoted++;
          continue;
        }

        try {
          visitor.convertToLead();
          const aggCtx = publisher.mergeObjectContext(visitor);
          const saveResult = await visitorRepo.save(aggCtx);
          if (saveResult.isErr()) {
            logger.warn(
              `  Error guardando ${contact.visitorId}: ${saveResult.error.message}`,
            );
            errors++;
            continue;
          }
          aggCtx.commit();
          logger.log(`  ✅ Promovido a LEAD: ${contact.visitorId}`);
          promoted++;
        } catch (e) {
          logger.warn(
            `  Error promoviendo ${contact.visitorId}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          errors++;
        }
      }
    }

    logger.log(
      `Resumen: promovidos=${promoted}, omitidos=${skipped}, errores=${errors}, dryRun=${!!options.dryRun}`,
    );
    // Dar tiempo a handlers async (p.ej. SyncLeadOnLifecycleChanged) antes de cerrar Mongo
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

program
  .parseAsync(process.argv)
  .then(() => {
    console.log('Comando ejecutado con éxito');
  })
  .catch((error) => {
    console.error('Error al ejecutar el comando:', error);
  });
