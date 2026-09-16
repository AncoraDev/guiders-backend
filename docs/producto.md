# guiders-backend

Este proyecto es el backend de un producto orientado a comerciales, permitiendo que puedan comunicarse con los visitantes del sitio web en tiempo real y sin fricción.

📚 **Documentación técnica**: índice completo en [`docs/README.md`](docs/README.md).  
🐳 **Docker**: [`docker/README.md`](docker/README.md) (`npm run docker:up`).

## Descripción

**guiders-backend** provee la infraestructura de servidor necesaria para habilitar la comunicación instantánea entre comerciales y visitantes de la web. El objetivo es eliminar barreras y facilitar el contacto, mejorando la experiencia del usuario y potenciando la conversión.

## Tecnologías utilizadas

- [NestJS](https://nestjs.com/) v11 (framework Node.js para el desarrollo de aplicaciones backend robustas y escalables)
- [TypeScript](https://www.typescriptlang.org/) (lenguaje principal de desarrollo con tipado estático)
- [@nestjs/cqrs](https://docs.nestjs.com/recipes/cqrs) (implementación oficial de CQRS para NestJS)
- [TypeORM](https://typeorm.io/) (ORM para la persistencia de datos)
- [Socket.IO](https://socket.io/) (biblioteca para comunicación en tiempo real)
- [JWT](https://jwt.io/) (JSON Web Tokens para autenticación)

## Instalación y Configuración

1. Clona el repositorio:
   ```bash
   git clone https://github.com/RogerPugaRuiz/guiders-backend.git
   cd guiders-backend
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las variables de entorno:
   ```bash
   cp .env.example .env
   # Edita el archivo .env con tus configuraciones
   ```

4. Inicia el servidor de desarrollo:
   ```bash
   npm run start:dev
   ```

## Ejemplo de uso

### API REST

La API estará disponible en el puerto especificado (por defecto, 3000). Puedes utilizar la API de la siguiente manera:

```typescript
// Ejemplo de registro de visitante
const response = await fetch('http://localhost:3000/auth/visitor/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    apiKey: 'api-key-de-la-empresa',
    clientId: 12345,
    userAgent: navigator.userAgent,
    domain: window.location.hostname,
  }),
});

const { accessToken, refreshToken } = await response.json();
```

### WebSockets

Para la comunicación en tiempo real:

```typescript
// Conectar al WebSocket
const socket = io('http://localhost:3000', {
  auth: {
    token: accessToken,
  },
});

// Escuchar mensajes entrantes
socket.on('chat:message', (data) => {
  console.log('Nuevo mensaje:', data);
});

// Enviar un mensaje
socket.emit('chat:message', {
  to: 'id-del-comercial',
  message: 'Hola, necesito ayuda con un producto',
});
```

Para ejemplos más detallados, consulta la [documentación de uso](/docs/usage-examples.md).

## Arquitectura general

Este proyecto sigue una arquitectura basada en **Domain-Driven Design (DDD)** y **Command Query Responsibility Segregation (CQRS)**, implementada sobre NestJS v11 y el paquete oficial `@nestjs/cqrs`. El objetivo es lograr un sistema desacoplado, escalable y fácil de mantener, donde cada contexto de negocio es autónomo y evoluciona de forma independiente.

### Principios clave

- **DDD**: El dominio es el núcleo de cada contexto, modelando las reglas y procesos de negocio mediante entidades, agregados, value objects y eventos de dominio.
- **CQRS**: Se separan los comandos (operaciones de escritura) de las queries (operaciones de lectura), permitiendo optimizar y escalar cada una de forma independiente.
- **Eventos**: Los cambios relevantes en el dominio generan eventos, que son manejados por EventHandlers siguiendo el patrón `<NewAction>On<OldAction>EventHandler`.
- **Estructura modular**: Cada contexto (por ejemplo, [auth](src/context/auth/README.md), [company](src/context/company/README.md), [conversations](src/context/conversations/README.md), [real-time](src/context/real-time/README.md), [tracking](src/context/tracking/README.md), [visitors](src/context/visitors/README.md), [shared](src/context/shared/README.md)) tiene su propio README explicando su propósito y estructura interna.

### Flujo técnico

El proyecto implementa el patrón CQRS con el siguiente flujo:

![Flujo CQRS](/docs/diagrams/cqrs-flow.mmd)

1. El **Controller** recibe una petición HTTP y la convierte en un Command o Query.
2. El **CommandBus/QueryBus** enruta la solicitud al handler correspondiente.
3. El **Handler** ejecuta la lógica de negocio, interactuando con el dominio.
4. Las entidades del **Dominio** pueden emitir eventos cuando cambian su estado.
5. Los **EventHandlers** reaccionan a estos eventos para mantener la coherencia, actualizar proyecciones, etc.

El flujo general de la aplicación se muestra en el siguiente diagrama:

![Flujo de la Aplicación](/docs/diagrams/application-flow.mmd)

Para más detalles sobre la arquitectura, consulta la [documentación técnica](/docs/technical-architecture.md).

### Estructura de carpetas

- `src/context/<contexto>/application/` — Lógica de aplicación (commands, events, queries, dtos)
- `src/context/<contexto>/domain/` — Entidades, repositorios, value objects y eventos de dominio
- `src/context/<contexto>/infrastructure/` — Adaptadores, persistencia y controladores

Consulta el README de cada contexto para entender su responsabilidad y cómo se integra en la arquitectura global:

- [Auth](src/context/auth/README.md)
- [Company](src/context/company/README.md)
- [Conversations](src/context/conversations/README.md)
- [Real-Time](src/context/real-time/README.md)
- [Tracking](src/context/tracking/README.md)
- [Visitors](src/context/visitors/README.md)
- [Shared](src/context/shared/README.md)

## Documentación de procesos automatizados

- [Guía de automatización de Pull Requests](docs/pr-automation-guide.md): Cómo configurar y mantener la automatización de PRs, asegurando compatibilidad con linters de Markdown.

## Contribuir al Proyecto

Si deseas contribuir al desarrollo de este proyecto, por favor consulta nuestra [Guía de Contribución](/docs/contribution-guide.md) que incluye:

- Configuración del entorno de desarrollo
- Flujo de trabajo para contribuciones
- Convenciones de código y nomenclatura
- Proceso para crear Pull Requests

### Requisitos previos

- Node.js (v18 o superior)
- npm (generalmente viene con Node.js)
- Git
- Docker (opcional, para entornos de desarrollo con contenedores)

### Comandos principales

```bash
# Desarrollo
npm run start:dev         # Inicia el servidor en modo desarrollo
npm run lint              # Ejecuta el linter para verificar el código

# Pruebas
npm run test:unit         # Ejecuta pruebas unitarias
npm run test:int          # Ejecuta pruebas de integración
npm run test:e2e          # Ejecuta pruebas end-to-end

# Base de datos
npm run typeorm:migrate:run    # Ejecuta migraciones pendientes

# CLI
node bin/guiders-cli.js clean-database --force    # Limpia todas las entidades de la base de datos
node bin/guiders-cli.js create-company --name "Mi Compañía" --domain "micompania.com"    # Crea una nueva compañía
node bin/guiders-cli.js create-company-with-admin --name "Mi Compañía" --domain "micompania.com" --adminName "Admin" --adminEmail "admin@example.com"    # Crea una compañía con administrador

# CLI
node bin/guiders-cli.js clean-database --force    # Limpia todas las entidades de la base de datos
node bin/guiders-cli.js create-company --name "Mi Compañía" --domain "micompania.com"    # Crea una nueva compañía
node bin/guiders-cli.js create-company-with-admin --name "Mi Compañía" --domain "micompania.com" --adminName "Admin" --adminEmail "admin@example.com"    # Crea una compañía con administrador
```

## Recursos adicionales

- [Índice de documentación](docs/README.md)
- [Arquitectura](docs/architecture/architecture.md)
- [Guía de desarrollo](docs/architecture/development-guide.md)
- [Diagramas](docs/diagrams/)

## Autor

- Roger Puga Ruiz

## Licencia

Este proyecto está licenciado bajo la licencia **Proprietary**. Todos los derechos reservados. No se permite la copia, distribución ni el uso del código sin permiso explícito del autor.
