#!/usr/bin/env node
/*
  Configura automáticamente clientes OIDC en Keycloak para entorno local:
  - Permite editar el username y lo alinea con el email
  - Establece redirectUris y webOrigins
  - Asegura cliente público y flujo estándar habilitado
  - Soporta múltiples clientes (console, admin)

  Uso:
    node bin/keycloak-configure-client.js [clientId]
    node bin/keycloak-configure-client.js            # Configura todos los clientes
    node bin/keycloak-configure-client.js console    # Configura solo console
    node bin/keycloak-configure-client.js admin      # Configura solo admin
*/
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Carga simple de .env (sin dependencia externa)
function loadEnvFromDotEnv() {
  try {
    const envPath = path.resolve(__dirname, '..', '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .forEach((line) => {
        const eq = line.indexOf('=');
        if (eq === -1) return;
        const k = line.substring(0, eq).trim();
        let v = line.substring(eq + 1).trim();
        // Quitar comillas si existieran
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.substring(1, v.length - 1);
        }
        if (!process.env[k]) process.env[k] = v;
      });
  } catch (_) {
    // ignore
  }
}

loadEnvFromDotEnv();

loadEnvFromDotEnv();

// Configuraciones de clientes
const CLIENT_CONFIGS = {
  console: {
    clientId: process.env.OIDC_CONSOLE_CLIENT_ID || 'console',
    redirectUri: process.env.OIDC_CONSOLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:3000'}/api/bff/auth/callback/console`,
    appOrigins: ['http://localhost:4200'],
  },
  admin: {
    clientId: process.env.OIDC_ADMIN_CLIENT_ID || 'admin',
    redirectUri: process.env.OIDC_ADMIN_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:3000'}/api/bff/auth/callback/admin`,
    appOrigins: ['http://localhost:4201'],
  },
};

async function configureClient(clientKey, config) {
  const base = process.env.KEYCLOAK_URL || `http://localhost:${process.env.KEYCLOAK_PORT || '8080'}`;
  const realm = process.env.KEYCLOAK_REALM || 'guiders';
  const adminUser = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
  const adminPass = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin123';

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  
  // En local añadimos orígenes típicos
  const webOrigins = [appUrl, ...config.appOrigins];
  // Permitimos comodín solo en desarrollo (no recomendado en prod)
  if ((process.env.NODE_ENV || 'development') !== 'production') {
    webOrigins.push('*');
  }

  const redirectUris = [config.redirectUri];
  if ((process.env.NODE_ENV || 'development') !== 'production') {
    redirectUris.push('http://localhost:3000/*');
  }

  // Destinos válidos tras logout SSO (frontend apps)
  const postLogoutRedirectUris = Array.from(
    new Set([
      ...config.appOrigins,
      ...config.appOrigins.map((o) => `${o}/`),
      `${appUrl}/`,
    ]),
  );

  console.log(`\n🔧 Configurando cliente ${clientKey} (${config.clientId})...`);

  // Obtener token admin (realm master)
  const tokenRes = await axios.post(
    `${base}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: adminUser,
      password: adminPass,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  const accessToken = tokenRes.data.access_token;

  const kc = axios.create({
    baseURL: `${base}/admin/realms/${encodeURIComponent(realm)}`,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Buscar cliente
  const search = await kc.get(`/clients`, { params: { clientId: config.clientId } });
  let client = search.data && search.data[0];

  if (!client) {
    // Crear cliente público con flujo estándar
    const createRes = await kc.post('/clients', {
      clientId: config.clientId,
      protocol: 'openid-connect',
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      redirectUris,
      webOrigins,
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'post.logout.redirect.uris': postLogoutRedirectUris.join('##'),
      },
    });
    // Obtenerlo de nuevo para conseguir id
    const after = await kc.get(`/clients`, { params: { clientId: config.clientId } });
    client = after.data && after.data[0];
    if (!client) throw new Error(`No se pudo crear el cliente ${config.clientId} en Keycloak`);
    console.log(`✅ Cliente creado: ${client.clientId}`);
  } else {
    // Actualizar cliente existente
    const id = client.id;
    // Mezclar con valores actuales para no borrar otros campos críticos
    const existingPostLogout = (client.attributes || {})['post.logout.redirect.uris']
      ? String((client.attributes || {})['post.logout.redirect.uris']).split('##')
      : [];
    const updated = {
      ...client,
      publicClient: true,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      redirectUris: Array.from(new Set([...(client.redirectUris || []), ...redirectUris])),
      webOrigins: Array.from(new Set([...(client.webOrigins || []), ...webOrigins])),
      attributes: {
        ...(client.attributes || {}),
        'pkce.code.challenge.method': 'S256',
        'post.logout.redirect.uris': Array.from(
          new Set([...existingPostLogout, ...postLogoutRedirectUris]),
        ).join('##'),
      },
    };
    await kc.put(`/clients/${encodeURIComponent(id)}`, updated);
    console.log(`✅ Cliente actualizado: ${client.clientId}`);
  }

  console.log(`   - redirectUris: ${JSON.stringify(redirectUris)}`);
  console.log(`   - webOrigins: ${JSON.stringify(webOrigins)}`);
  console.log(`   - postLogoutRedirectUris: ${JSON.stringify(postLogoutRedirectUris)}`);
}

async function openRealm() {
  const base = process.env.KEYCLOAK_URL || `http://localhost:${process.env.KEYCLOAK_PORT || '8080'}`;
  const realm = process.env.KEYCLOAK_REALM || 'guiders';
  const adminUser = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
  const adminPass = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin123';

  const tokenRes = await axios.post(
    `${base}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: adminUser,
      password: adminPass,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  return axios.create({
    baseURL: `${base}/admin/realms/${encodeURIComponent(realm)}`,
    headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
  });
}

async function allowEditingUsernames(kc) {
  const { data } = await kc.get('');
  if (data.editUsernameAllowed === true) {
    console.log('El realm ya permite editar el username');
    return;
  }
  await kc.put('', { ...data, editUsernameAllowed: true });
  console.log('El realm ahora permite editar el username');
}

async function alignUsernamesToEmail(kc) {
  let first = 0;
  const max = 100;
  let aligned = 0;
  let failed = 0;

  for (;;) {
    const { data } = await kc.get('/users', { params: { first, max } });
    const users = Array.isArray(data) ? data : [];
    for (const user of users) {
      const email = typeof user.email === 'string' ? user.email.trim() : '';
      if (!email || user.username === email) continue;
      try {
        await kc.put(`/users/${encodeURIComponent(user.id)}`, {
          id: user.id,
          username: email,
          email,
          firstName: user.firstName,
          lastName: user.lastName,
          enabled: user.enabled,
          emailVerified: true,
          requiredActions: user.requiredActions,
          attributes: user.attributes,
        });
        aligned += 1;
      } catch (error) {
        failed += 1;
        const status = error.response?.status;
        console.error(
          `No se pudo alinear el usuario ${user.id}: ${status || error.message}`,
        );
      }
    }
    if (users.length < max) break;
    first += users.length;
  }

  console.log(`Usernames alineados con el email: ${aligned}`);
  if (failed > 0) {
    console.log(`Usernames que no se pudieron alinear: ${failed}`);
  }
}

async function main() {
  const targetClient = process.argv[2]; // clientId específico desde argumentos
  
  if (targetClient && !CLIENT_CONFIGS[targetClient]) {
    console.error(`❌ Cliente desconocido: ${targetClient}`);
    console.log(`   Clientes disponibles: ${Object.keys(CLIENT_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  const base = process.env.KEYCLOAK_URL || `http://localhost:${process.env.KEYCLOAK_PORT || '8080'}`;
  const realm = process.env.KEYCLOAK_REALM || 'guiders';

  console.log(`🚀 Configurando clientes OIDC en Keycloak`);
  console.log(`   Realm: ${realm}`);
  console.log(`   Keycloak: ${base}`);

  const realmClient = await openRealm();
  await allowEditingUsernames(realmClient);
  await alignUsernamesToEmail(realmClient);

  if (targetClient) {
    await configureClient(targetClient, CLIENT_CONFIGS[targetClient]);
  } else {
    // Configurar todos los clientes
    for (const [clientKey, config] of Object.entries(CLIENT_CONFIGS)) {
      await configureClient(clientKey, config);
    }
  }

  console.log('\n🎉 Configuración completada!');
  console.log('   Rutas disponibles:');
  console.log('   - Console: /api/bff/auth/login/console');
  console.log('   - Admin:   /api/bff/auth/login/admin');
}

main().catch((e) => {
  console.error('Error configurando Keycloak:', e.response?.data || e.message || e);
  process.exit(1);
});
