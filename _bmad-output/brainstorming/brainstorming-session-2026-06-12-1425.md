---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'LeadCars como marca blanca en Guiders mediante iframe - validacion de auth y arquitectura multi-tenant'
session_goals: 'Validar el mecanismo de token compartido y el modelo multi-tenant white-label sin perder la posibilidad de usar Guiders como marca propia'
selected_approach: 'AI-Recommended (Pre-Mortem + First Principles + SCAMPER + Anti-Problem)'
techniques_used: [pre-mortem, first-principles, scamper, anti-problem]
ideas_generated: 100+
context_file: ''
---

# Brainstorming Session Results

**Facilitador:** Rogerpugaruiz
**Fecha:** 2026-06-12

## Resumen ejecutivo

Sesion de brainstorming orientada a validar el diseno tecnico de LeadCars como marca blanca en Guiders mediante iframe. El objetivo especifico fue tensionar la decision de auth (token compartido) y el modelo multi-tenant white-label, asegurando que Guiders pueda seguir operando como marca propia mientras soporta clientes white-label como LeadCars.

**Tecnicas aplicadas (AI-Recommended, en orden)**:
1. Pre-Mortem (27 ideas, 4 clusters de excavacion)
2. First Principles (11 ideas, 2 rounds)
3. SCAMPER (S/C/A/M/P/E/R, ~40 ideas)
4. Anti-Problem / Inversion (4 ideas)

**Descubrimientos clave**: 5
**Cambios al plan original**: 10
**Riesgos priorizados**: 8
**Acceptance criteria**: 14

---

## T1 - Pre-Mortem (27 ideas)

### Ideas generadas

| # | Idea | Cluster |
|---|---|---|
| 1 | Atacante de LeadCars forja tokens para usuarios de otras empresas | Seguridad |
| 2 | jti anti-replay en Redis no funciona bajo alta carga (race condition) | Seguridad |
| 3 | Navegador bloquea cookies SameSite=None (Safari es estricto) | Cookies/cross-domain |
| 4 | Proxy inverso de produccion strips headers Secure/SameSite | Cookies/cross-domain |
| 5 | Cliente quiere dominio propio sin control DNS sobre guiders.es | Branding/marca |
| 6 | Comercial ve logo Guiders en el inbox y dice "esto no es nuestro" | Branding/marca |
| 10 | Token embed expira mientras usuario rellena formulario de 20 min | Auth/token |
| 11 | Backend de LeadCars es comprometido y genera tokens para espiar usuarios | Seguridad |
| 12 | Comercial cambia password en Keycloak pero token embed sigue activo | Auth/token |
| 13 | Bug en codigo Guiders filtra datos de un cliente a otro (data leakage) | Multi-tenant |
| 14 | Cliente white-label sube logo malicioso (XSS en iframe) | Multi-tenant |
| 15 | White-label de colores rompe accesibilidad (contraste bajo) | Branding/marca |
| 16 | 10 clientes white-label y cada uno quiere funcionalidad diferente del admin | Operacional |
| 17 | Cliente necesita soporte tecnico desde su panel pero Guiders no tiene acceso al iframe | Operacional |
| 18 | Iframe tarda 8 segundos en cargar para usuario en otro continente | Operacional |
| 19 | Diseno de componentes es muy diferente a como se ven los componentes de Guiders | Branding/marca |
| 20 | Guiders o LeadCars dejan de funcionar | Operacional |
| 21 | LeadCars luego quiere tener mas control sobre el codigo | Operacional |
| 22 | No podemos tener todos los datos de white-label en el mismo servidor | Multi-tenant |
| 23 | Usuarios de LeadCars prefieren acceder al entorno marca blanca | Branding/marca |
| 24 | Que cambia el auth entre el entorno marca blanca y el normal, Keycloak u otro sistema | Auth/token |
| 25 | Problemas entre dominios | Cookies/cross-domain |
| 26 | No es lo suficientemente parecido a la marca de LeadCars como ellos quieren | Branding/marca |
| 27 | Panel de admin tiene que ser tambien un iframe o puede ser con nuestra marca | Branding/marca |

### Respuestas de excavacion (4 clusters)

**Pregunta A** (idea #11 - backend LeadCars comprometido): El usuario prefiere redireccion con popup, pero hay que verificar que Keycloak lo soporte.

**Pregunta B** (ideas #3 y #4 - SameSite=None y proxy): Preferiria reusar lo que ya tenemos en auth, no hacer codigo de cero.

**Pregunta C** (ideas #6, #19, #26, #27 - white-label insuficiente): Lo que LeadCars pide es que NO se note la diferencia entre un Guidres y LeadCars.

**Pregunta D** (idea #24 - Keycloak o sistema propio): 100% LeadCars tiene su propio login basado en usuario y contrasena pero NO incorpora el realm de Guiders.

### Descubrimiento clave del Pre-Mortem

La decision de token-compartido no fue una eleccion de diseno, fue **forzada por el aislamiento de IdP de LeadCars**. Esto significa que el plan no contempla alternativa real para clientes con IdP propio.

---

## T2 - First Principles (11 ideas)

### Round 1 (3 ideas)

| # | Idea | Categoria |
|---|---|---|
| FP1 | Pedir a LeadCars que use una API para que con el nombre del usuario se genere un usuario de iframe en Guiders | API mapping |
| FP2 | Hacer como YouTube/extensions que tienen iframe con login | Patron conocido |
| FP3 | Hacer que tenga que registrarse en nuestro SSO antes para ver la pestana de Guiders en LeadCars | SSO forzado |

### Round 2 (8 ideas con prompts de desbloqueo)

| # | Idea | Categoria |
|---|---|---|
| FP4 | Token opaco: Guiders delega validacion en LeadCars sin conocer identidad | Token opaco |
| FP5 | Portal de consentimiento: usuario autoriza a Guiders desde contexto LeadCars | Consent flow |
| FP6 | Token exchange: LeadCars intercambia su token IdP por token Guiders | Token exchange |
| FP7 | Impersonation: LeadCars dice "este es mi usuario" y Guiders confia | Asercion |
| FP8 | Sesion 100% delegada: Guiders solo recibe identificador anonimo + permisos | Identidad anonima |
| FP9 | Token anonimo firmado por LeadCars, Guiders valida contra clave publica de LeadCars | Firma asimetrica |
| FP10 | LeadCars como cliente B2B con API key empresarial, valida usuarios internamente | Modelo B2B |
| FP11 | Proxy de identidad: LeadCars intercepta requests del iframe y las re-firma | Proxy |

---

## T3 - SCAMPER (~40 ideas)

### S - Sustituir (5 ideas)

- S1: Web component <guiders-admin> con Shadow DOM (DESCARTADO - mas trabajo para LeadCars)
- S2: Token embed JWT -> opaque token (sin info de usuario, solo referencia en Redis)
- S3: White-label por MongoDB -> CSS variables inyectadas en build-time
- S4: BFF como unico punto de sesion -> sesion JWT stateless en el propio admin
- S5: Endpoint /embed/login -> /embed/start server-to-server + /embed/callback browser

### C - Combinar (5 ideas)

- C1: Token embed + white-label config -> un solo endpoint POST /v2/integration/embed/start
- C2: IntegrationApiKey + EmbedToken -> reusar la misma API key
- C3: Redis jti + sesion BFF -> una sola key en Redis
- C4: CSP frame-ancestors + CORS -> un solo header Permissions-Policy + X-Frame-Options por empresa
- C5: BrandingService + ThemeProvider -> un WhiteLabelProvider singleton

### A - Adaptar (5 ideas)

- A1: Stripe Elements (iframe con Shadow DOM)
- A2: Auth0 Embedded Login (iframe cross-domain con same-site cookies)
- A3: Google reCAPTCHA enterprise (token server-to-server + consumo en navegador)
- A4: Tailscale Funnel (URL unica por cliente via DNS CNAME)
- A5: Cloudflare Access (JWTs cortos + cookies + rewriting de headers)

### M - Modificar (5 ideas)

- M1: Exagerar TTL del token: de 5min a 8h (jornada laboral)
- M2: Minimizar el iframe: solo rutas que el cliente necesita
- M3: Exagerar el branding: tema completo que overridea TODO
- M4: Minimizar la confianza: auditar todas las acciones con source: embed
- M5: Modificar el flujo de token: token en memoria con refresh cada 4min

### P - Proposito / Eliminar (5 ideas)

- P1: Eliminar endpoint /embed/login si el token va por query param Authorization
- P2: Eliminar cookies HttpOnly usando tokens en sessionStorage
- P3: Eliminar tabla white_label_configs si cada cliente tiene su propio build
- P4: Eliminar campo embedEnabled (ya hay gating por API Key)
- P5: Eliminar el iframe si usamos web component (DESCARTADO por constraint LeadCars)

### E - Eliminar del plan (4 ideas)

- E1: Eliminar jti anti-replay (opaque token ya es anti-replay por diseno)
- E2: Eliminar BFF como intermediario del embed (token directo a microservicios)
- E3: Eliminar modulo white-label para el caso embed (es para admin de Guiders, no embed)
- E4: Eliminar rol superadmin del contexto embed

### R - Reorganizar / Reverse (4 ideas)

- R1: Invertir: Guiders conecta a LeadCars via WebSocket
- R2: Invertir: LeadCars fuerza registro en Guiders por SSO
- R3: Invertir: LeadCars sirve su propio CSS via postMessage
- R4: Invertir: LeadCars es el "proxy" de Guiders

### Ideas SCAMPER mas disruptivas

- S1 (web component) - DESCARTADO por constraint de mantenimiento LeadCars
- S2 (opaque token) - Adoptado
- C1 (branding + token en una llamada) - Adoptado
- C2 (reusar IntegrationApiKey) - Adoptado
- M5 (token refresh en memoria) - Adoptado
- R3 (LeadCars sirve su propio CSS) - Descartado (contradice D6 - mantenimiento 100% en Guiders)
- E3 (eliminar modulo white-label para embed) - Adoptado parcialmente: reusar modulo existente pero no crear nuevo flujo de configuracion para embed

---

## T4 - Anti-Problem / Inversion (4 ideas)

| # | Idea |
|---|---|
| Anti1 | Si Guiders no fuera marca propia -> el iframe no necesitaria ocultar chrome ni branding |
| Anti2 | Si Guiders no fuera marca propia -> cada cliente tendria su propio deployment (repo fork) |
| Anti3 | Si Guiders no fuera marca propia -> no habria modulo white-label |
| Anti4 | Si Guiders no fuera marca propia -> el BFF no existiria, JWT directo contra la API |

### Pregunta critica que emerge

> Que diferencia a Guiders como marca propia de Guiders como producto white-label? Donde esta la linea que hace que Guiders quiera preservar su marca y no simplemente vender codigo?

### Restriccion critica descubierta

LeadCars quiere **delegar el mantenimiento del codigo en Guiders**:
- El iframe es nuestro, ellos lo incrustan
- El chrome del admin es nuestro, ellos no lo tocan
- El branding visual vive en Guiders
- El mantenimiento de todo lo anterior es nuestro

LeadCars **NO quiere mantener**:
- Un web component propio
- Un SDK embebible que actualizar
- Snippets que copiar y pegar

**Implicacion**: Web component (S1) descartado. SDK publico (libs/embed-sdk) descartado. Iframe clasico (Opcion A) requiere cookies cross-domain fragil. Redireccion (Opcion B) pierde sensacion white-label. **Opcion C (iframe + postMessage) es la unica viable**.

---

## Constraint adicional del usuario

El widget de chat (`guiders-pixel`) esta **fuera del alcance del white-label** porque es generico. Los concesionarios de LeadCars (restrenacar, rmotion) usan el SDK estandar de Guiders, no son parte del white-label de LeadCars.

### Implicacion

| Producto | En alcance white-label? | Razon |
|---|---|---|
| Panel Admin en app.leadcars.com | SI | Caso nuevo a disenar |
| Widget chat en restrenacar/rmotion | NO | Generico, ya existe |
| SDK guiders-pixel | NO | Producto estandar de Guiders |

---

## Convergencia del diseno

### Opcion C detallada: iframe + postMessage bootstrap

```
1. LeadCars incrusta <iframe src="https://app.guiders.es/embed/start?company=leadcars&user=u_123">
2. Guiders sirve HTML wrapper minimalista con admin Angular
3. Angular detecta modo embed, carga branding via BrandingService
4. Angular envia postMessage('guiders:ready') al parent (LeadCars)
5. LeadCars envia postMessage('leadcars:auth', token) al iframe
6. Iframe valida origin === 'https://app.leadcars.com'
7. Iframe hace fetch POST /embed/authenticate con el token
8. Backend valida token, crea sesion BFF, devuelve user data
9. Angular carga dashboard con sesion BFF establecida
```

### Ventajas tecnicas

- Cero cookies cross-domain (sesion BFF interna)
- Cero CSP frame-ancestors (es Guiders quien sirve el iframe)
- Cero mantenimiento en LeadCars (solo <iframe> HTML)
- Branding controlado por Guiders
- Token nunca sale del navegador del usuario
- Origin verification estricta
- Sandbox en iframe opcional

---

## Cambios al plan original (sintesis)

| # | Cambio | Antes | Ahora |
|---|---|---|---|
| C1 | Eliminar libs/embed-sdk | SDK publico para LeadCars | No necesario, solo <iframe> |
| C2 | Eliminar EMBED_JWT_SECRET | JWT firmado | Token opaque sin firma |
| C3 | Eliminar cookies SameSite=None | Cookies cross-domain | Sesion BFF interna |
| C4 | Eliminar jti anti-replay separado | Redis con TTL explicito | Reusar sesion Redis |
| C5 | Cambiar /embed/login por /embed/authenticate | URL de canje | postMessage handshake |
| C6 | Mantener campo embedEnabled | Feature flag | Necesario, gating por empresa |
| C7 | Reusar IntegrationApiKey para embed | API Key separada | Un secreto, multiples usos |
| C8 | Validar Opcion C (iframe + postMessage) | Iframe clasico | Validado por brainstorming |
| C9 | Mantener feature /branding | Sin cambios | Necesario para configurar branding |
| C10 | Mantener modulo white-label | Sin cambios | Ya funciona por companyId |

---

## Trabajo restante (post-brainstorming)

| # | Tarea | Esfuerzo | Dependencia |
|---|---|---|---|
| T1 | Endpoint POST /v2/integration/embed/authenticate + CQRS | 2-3 dias | - |
| T2 | EmbedTokenService (token opaque + Redis) | 1-2 dias | T1 |
| T3 | HTML wrapper GET /embed/start | 2-3 dias | T1, T2 |
| T4 | EmbedWrapperComponent + EmbedBootstrapService en admin | 2-3 dias | T3 |
| T5 | BrandingService extendido para modo embed | 1-2 dias | T4 |
| T6 | EmbedGuard para rutas /embed/* | 1 dia | T4 |
| T7 | embed.routes.ts (rutas) | 1 dia | T4, T6 |
| T8 | Feature /branding (UI admin) | 2 dias | - |
| T9 | white-label-data-access (servicio Angular) | 1 dia | T8 |
| T10 | Configuracion CORS en backend (origen LeadCars) | 0.5 dias | - |
| T11 | CSP frame-ancestors por empresa | 0.5 dias | T8 |
| T12 | Tests unitarios (backend + frontend) | 2 dias | T1-T9 |
| T13 | Tests integracion backend | 1-2 dias | T1, T2 |
| T14 | Tests e2e Playwright | 1-2 dias | T3-T9 |
| T15 | Documentacion docs/leadcar/embed-integration.md | 1 dia | T1-T11 |
| T16 | Actualizar AGENTS.md de contextos afectados | 0.5 dias | T1-T9 |
| **Total** | | **~18-25 dias** | |

---

## Riesgos priorizados

| # | Riesgo | Mitigacion | Prioridad |
|---|---|---|---|
| R1 | LeadCars no envia postMessage de auth en 5s | Timeout -> pantalla de error con boton "Reintentar" | Alta |
| R2 | Origin spoofing | Verificar event.origin === 'https://app.leadcars.com' estrictamente | Alta |
| R3 | Branding se aplica tarde, flash de Guiders | CSS variables inline en <head> del wrapper antes de cargar Angular | Media |
| R4 | Multiples iframes en la misma pagina | Correlacion via iframe.id o iframe.name | Media |
| R5 | Token expira durante uso activo | Refresh silencioso cada 30min sin interrumpir | Alta |
| R6 | Backend de LeadCars comprometido | Cada request tiene su propio token de corta duracion | Media |
| R7 | Cliente quiere mas branding del que soporta el modulo | Roadmap: extender white-label con i18n y copyOverride | Baja |
| R8 | Multi-tenant bug filtra datos entre clientes | Auditoria: cada request al embed loggea companyId + userId; tests de aislamiento | Alta |

---

## Acceptance criteria (14)

1. AC1: LeadCars puede incrustar `<iframe src="https://app.guiders.es/embed/start?company=leadcars&user=u_123">` sin codigo adicional
2. AC2: Branding aplicado en menos de 500ms desde el handshake
3. AC3: Chrome de Guiders oculto en modo embed (sidebar, top bar, footer)
4. AC4: Timeout 5s -> pantalla de error con boton "Reintentar"
5. AC5: Origin verification estricta antes de aceptar token
6. AC6: Sesion BFF establecida internamente, sin cookies cross-domain
7. AC7: Evento EmbedTokenAuthenticated emitido por cada auth exitosa (companyId, userId, origin, timestamp, ipAddress)
8. AC8: Solucion soporta multiples clientes white-label simultaneamente
9. AC9: LeadCars puede desconectar usuario via postMessage('leadcars:logout')
10. AC10: Navegacion a URL no permitida -> redirect a /embed/error
11. AC11: Token embed expira en 8h con refresh cada 30min
12. AC12: Modulo white-label reusado sin cambios estructurales, solo campo embedEnabled
13. AC13: Aislamiento cross-tenant validado por tests
14. AC14: Endpoint requiere IntegrationApiKey valida y que pertenezca a la companyId solicitada

---

## Siguiente paso

Lanzar `bmad-create-prd` con este output como input para formalizar el PRD con user stories, acceptance criteria (los 14 ACs), out-of-scope, y metricas de exito.

---

# Extension post-brainstorming: matriz de permisos por rol en embed

## Roles del sistema Guiders (estado actual)

| Rol | Uso tipico | Empresa |
|---|---|---|
| superadmin | Guiders interno, multi-empresa | Guiders HQ |
| admin | Admin de una empresa | Cliente (LeadCars) |
| supervisor | Supervisor de equipo comercial | Cliente |
| commercial | Comercial de chat | Cliente |
| visitor | Visitante anonimo (no en embed) | N/A en embed |

## Rutas del sidebar admin y roles que las usan

| Ruta | Quien accede | Roles requeridos (backend) |
|---|---|---|
| /dashboard | Todos los internos | Mixto (lectura) |
| /users | Admin, superadmin | admin, superadmin |
| /integrations | Admin, superadmin | admin, superadmin |
| /integrations/api-keys | Admin, superadmin | admin, superadmin |
| /integrations/sites | Admin, superadmin | admin, superadmin |
| /integrations/leadcars | Admin, superadmin | admin, superadmin |
| /leads/list | Admin, supervisor, commercial | admin, commercial, supervisor |
| /leads/sync-records | Admin, supervisor, commercial | admin, commercial, supervisor |
| /ai | Admin, superadmin | admin, superadmin |
| /branding | Admin, superadmin (a crear) | admin, superadmin (a anadir) |
| /settings/profile | Cualquier interno | admin, commercial, supervisor, superadmin |

## Que puede hacer un commercial de LeadCars en el embed

| Accion | Permitido | Notas |
|---|---|---|
| Ver inbox de conversaciones | SI | Funcion principal |
| Abrir y responder chats asignados | SI | Core del trabajo |
| Ver visitantes | SI | Contexto del chat |
| Filtrar/buscar visitantes | SI | Herramienta habitual |
| Ver leads (lista) | SI | Lectura |
| Ver sync records de LeadCars | SI | Solo lectura |
| Ver config IA | NO | Solo admin |
| Editar config IA | NO | Solo admin |
| Ver branding | SI (lectura) | Ya hay control por Roles en backend |
| Cambiar branding | NO | Solo admin o superadmin |
| Generar/regenerar API keys | NO | Solo admin |
| Configurar integraciones (sites, LeadCars) | NO | Solo admin |
| Cambiar su propia contrasena | SI | Su cuenta |
| Cambiar rol de otro usuario | NO | Solo admin |
| Crear/eliminar usuarios | NO | Solo admin |
| Ver lista de usuarios | NO | Solo admin |
| Ver config de LLM | NO | Solo admin |
| Acceder a /ai | NO | Ruta protegida |

## Que puede hacer un admin de LeadCars en el embed

| Accion | Permitido | Notas |
|---|---|---|
| Todo lo del commercial | SI | Hereda permisos |
| Ver lista de usuarios | SI | Para gestionar su equipo |
| Crear/editar/eliminar usuarios | SI | Para onboarding |
| Generar/rotar API keys | SI | Para integraciones |
| Configurar sitios (sites) | SI | Para multi-dominio |
| Configurar LeadCars (CRM) | SI | Para sincronizacion |
| Configurar LLM | SI | Si LeadCars quiere customizar IA |
| Ver y cambiar branding | SI | Personalizar marca |
| Configurar embedEnabled para OTROS clientes | NO | Interno de Guiders |
| Crear/eliminar empresas (companies) | NO | Solo superadmin |
| Ver TODAS las empresas (multi-tenant) | NO | Solo superadmin |

## Que puede hacer un supervisor de LeadCars en el embed

| Accion | Permitido | Notas |
|---|---|---|
| Casi todo lo de commercial | SI | |
| Asignar chats a comerciales | SI | Funcion principal |
| Editar reglas de asignacion | SI | Roles(['admin', 'supervisor', 'commercial']) |
| Ver metricas del equipo | SI | |
| Ver lista de usuarios | Verificar | No aparece en el patron de controllers |
| Crear/eliminar usuarios | NO | Solo admin |
| Configurar integraciones | NO | Solo admin |
| Configurar IA | NO | Solo admin |
| Cambiar branding | NO | Solo admin o superadmin |

## Sidebar del embed filtrado por rol (recomendacion)

**Comercial** ve:
- Dashboard, Visitors, Leads > Lista, Leads > Sincronizaciones

**Supervisor** ve:
- Dashboard, Visitors, Leads > Lista, Leads > Sincronizaciones, Reglas de asignacion (si existe ruta)

**Admin** ve:
- Dashboard, Users, Integraciones > API Keys, Integraciones > Sitios, Integraciones > LeadCars, Leads > Lista, Leads > Sincronizaciones, Configuracion IA, Marca Blanca

**Nunca visible en embed** (incluso para admin):
- Settings > Profile (cambio de password, email)
- Cambio de embedEnabled (interno de Guiders)
- Gestion de otras empresas

## Cambios derivados al plan

| # | Cambio | Razon |
|---|---|---|
| C1 | Sidebar del embed debe ser computed() filtrado por rol | El plan original asumia sidebar estatica |
| C2 | /settings/profile debe ser bloqueado o redirigido en modo embed | Evitar desincronizacion de cuenta con LeadCars |
| C3 | /integrations/leadcars debe ser ocultado en embed | Redundante con el panel de LeadCars |
| C4 | El token embed debe llevar el userId Y los roles | Para que el sidebar se renderice segun rol sin otro round-trip |
| C5 | EmbedGuard debe verificar el rol antes de renderizar rutas protegidas | Defensa en profundidad (no solo backend) |
| C6 | El refresh del token debe incluir los roles actuales | Si un admin es degradado a commercial, el iframe debe reflejarlo en menos de 30min |

## Acceptance criteria adicionales

| # | AC |
|---|---|
| AC15 | El sidebar del embed se filtra dinamicamente segun el rol del usuario autenticado |
| AC16 | Un comercial solo ve Dashboard, Visitors y Leads en el sidebar del embed |
| AC17 | Un supervisor ve Dashboard, Visitors, Leads y reglas de asignacion |
| AC18 | Un admin ve Dashboard, Users, Integraciones, Leads, IA y Marca Blanca |
| AC19 | Las rutas /settings/profile y /integrations/leadcars devuelven 403 en embed (no 404, para no revelar existencia) |
| AC20 | El token embed incluye el array roles del usuario |
| AC21 | El sidebar se re-renderiza al refrescar el token si los roles cambiaron |
| AC22 | Un commercial que intenta acceder a /branding mediante URL directa recibe 403 o redirect a /embed/error |

## Total ACs para el PRD

- ACs originales: 14
- ACs adicionales: 8 (AC15-AC22)
- **Total: 22 acceptance criteria** para el PRD
