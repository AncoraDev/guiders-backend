# Repositorio MongoDB para Reglas de Asignación

## Descripción

Implementación completa de persistencia MongoDB para las reglas de auto-asignación de chats en el sistema Guiders. Incluye entidad Mongoose, mapper, repositorio y tests de integración.

## Arquitectura

```
src/context/conversations-v2/infrastructure/persistence/
├── entity/
│   └── assignment-rules-mongoose.entity.ts      # Schema Mongoose
├── impl/
│   ├── mappers/
│   │   └── assignment-rules.mapper.ts           # Conversión dominio ↔ persistencia
│   ├── mongo-assignment-rules.repository.impl.ts # Implementación MongoDB
│   └── __tests__/
│       └── mongo-assignment-rules.repository.spec.ts # Tests unitarios
└── conversations-v2-persistence.module.ts       # Configuración DI
```

## Configuración

### 1. Dependencias del Módulo

El repositorio se registra automáticamente en `ConversationsV2PersistenceModule`:

```typescript
// conversations-v2-persistence.module.ts
providers: [
  {
    provide: ASSIGNMENT_RULES_REPOSITORY,
    useClass: MongoAssignmentRulesRepository,
  },
]
```

### 2. Schema MongoDB

La colección `assignment_rules` incluye:

- **Índices optimizados**: empresa/sitio único, búsquedas por estado y estrategia
- **Validación automática**: tipos enum, rangos numéricos, formatos de tiempo
- **Middleware**: actualización automática de `updatedAt`

```typescript
// Índices creados automáticamente
{ companyId: 1, siteId: 1 } // Único
{ companyId: 1 }
{ isActive: 1 }
{ defaultStrategy: 1 }
{ updatedAt: 1 }
```

## Uso en Aplicación

### Inyección de Dependencias

```typescript
import { Inject } from '@nestjs/common';
import { ASSIGNMENT_RULES_REPOSITORY, IAssignmentRulesRepository } from '../domain/assignment-rules.repository';

@Injectable()
export class SomeService {
  constructor(
    @Inject(ASSIGNMENT_RULES_REPOSITORY)
    private readonly assignmentRulesRepo: IAssignmentRulesRepository,
  ) {}
}
```

### Operaciones Principales

#### 1. Guardar/Actualizar Reglas

```typescript
const rules = AssignmentRules.create({
  companyId: 'company-123',
  siteId: 'site-456', // Opcional
  defaultStrategy: AssignmentStrategy.ROUND_ROBIN,
  maxChatsPerCommercial: 5,
  maxWaitTimeSeconds: 300,
  enableSkillBasedRouting: true,
  workingHours: {
    timezone: 'Europe/Madrid',
    schedule: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '18:00' },
      // ... más días
    ],
  },
  fallbackStrategy: AssignmentStrategy.RANDOM,
  priorities: { vip: 10, normal: 5 },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const result = await assignmentRulesRepo.save(rules);
if (result.isErr()) {
  // Manejar error
  console.error(result.error.message);
}
```

#### 2. Buscar Reglas Específicas

```typescript
// Por empresa y sitio específico
const result = await assignmentRulesRepo.findByCompanyAndSite('company-123', 'site-456');

// Solo por empresa (reglas generales)
const result = await assignmentRulesRepo.findByCompanyAndSite('company-123');

if (result.isOk() && result.value) {
  const rules = result.value;
  console.log(`Estrategia: ${rules.defaultStrategy}`);
  console.log(`Max chats: ${rules.maxChatsPerCommercial}`);
}
```

#### 3. Filtrar Reglas

```typescript
const result = await assignmentRulesRepo.findByFilters({
  companyId: 'company-123',
  isActive: true,
  strategy: AssignmentStrategy.SKILL_BASED,
});

if (result.isOk()) {
  const rules = result.value;
  console.log(`Encontradas ${rules.length} reglas activas`);
}
```

#### 4. Encontrar Reglas Aplicables (Lógica de Prioridad)

```typescript
// Prioriza: sitio específico > empresa general
const result = await assignmentRulesRepo.findApplicableRules('company-123', 'site-456');

if (result.isOk() && result.value) {
  const rules = result.value;
  
  // Verificar si está en horario de trabajo
  if (rules.isWithinWorkingHours()) {
    const strategy = rules.getActiveStrategy();
    console.log(`Usar estrategia: ${strategy}`);
  } else {
    console.log(`Usar estrategia de fallback: ${rules.fallbackStrategy}`);
  }
}
```

## Casos de Uso Comunes

### 1. Configuración Inicial de Empresa

```typescript
// Reglas básicas para nueva empresa
const basicRules = AssignmentRules.create({
  companyId: 'new-company-789',
  defaultStrategy: AssignmentStrategy.ROUND_ROBIN,
  maxChatsPerCommercial: 3,
  maxWaitTimeSeconds: 300,
  enableSkillBasedRouting: false,
  fallbackStrategy: AssignmentStrategy.RANDOM,
  priorities: { general: 1 },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

await assignmentRulesRepo.save(basicRules);
```

### 2. Configuración VIP para Sitio Específico

```typescript
// Reglas premium para sitio VIP
const vipRules = AssignmentRules.create({
  companyId: 'company-123',
  siteId: 'vip-site-456',
  defaultStrategy: AssignmentStrategy.SKILL_BASED,
  maxChatsPerCommercial: 2, // Menos carga para mejor atención
  maxWaitTimeSeconds: 120,   // Respuesta más rápida
  enableSkillBasedRouting: true,
  workingHours: {
    timezone: 'Europe/Madrid',
    schedule: [
      // Horarios extendidos para VIP
      { dayOfWeek: 1, startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 2, startTime: '08:00', endTime: '20:00' },
      { dayOfWeek: 6, startTime: '10:00', endTime: '16:00' }, // Sábados
    ],
  },
  fallbackStrategy: AssignmentStrategy.WORKLOAD_BALANCED,
  priorities: { vip: 20, premium: 15, normal: 5 },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

await assignmentRulesRepo.save(vipRules);
```

### 3. Soporte 24/7

```typescript
// Sin horarios de trabajo = disponible 24/7
const support247Rules = AssignmentRules.create({
  companyId: 'support-company',
  defaultStrategy: AssignmentStrategy.WORKLOAD_BALANCED,
  maxChatsPerCommercial: 8,
  maxWaitTimeSeconds: 180,
  enableSkillBasedRouting: true,
  workingHours: undefined, // Sin horarios = 24/7
  fallbackStrategy: AssignmentStrategy.ROUND_ROBIN,
  priorities: { 
    emergency: 25, 
    urgent: 15, 
    normal: 5 
  },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

await assignmentRulesRepo.save(support247Rules);
```

## Estrategias de Asignación Disponibles

1. **ROUND_ROBIN**: Distribución circular entre comerciales disponibles
2. **WORKLOAD_BALANCED**: Asigna al comercial con menor carga actual
3. **SKILL_BASED**: Basado en habilidades/especialización
4. **RANDOM**: Aleatorio entre comerciales disponibles

## Gestión de Horarios de Trabajo

```typescript
// Ejemplo de horarios flexibles
const workingHours = {
  timezone: 'America/Mexico_City',
  schedule: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }, // Lunes
    { dayOfWeek: 2, startTime: '09:00', endTime: '18:00' }, // Martes
    { dayOfWeek: 3, startTime: '09:00', endTime: '18:00' }, // Miércoles
    { dayOfWeek: 4, startTime: '09:00', endTime: '18:00' }, // Jueves
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' }, // Viernes (más corto)
    { dayOfWeek: 6, startTime: '10:00', endTime: '14:00' }, // Sábado (medio día)
    // Domingo sin configurar = no disponible
  ],
};
```

## Monitoreo y Logs

El repositorio incluye logging detallado:

```bash
[MongoAssignmentRulesRepository] 💾 Guardando reglas de asignación: companyId=company-123, siteId=site-456
[MongoAssignmentRulesRepository] ✅ Reglas guardadas: company-123:site-456
[MongoAssignmentRulesRepository] 🔍 Buscando reglas aplicables para company-123:site-456
[MongoAssignmentRulesRepository] ✅ Reglas específicas de sitio encontradas y activas
```

## Datos de Ejemplo

Usar el script de inicialización para crear datos de prueba:

```bash
node scripts/create-assignment-rules-example.js
```

Este script crea:
- Reglas básicas para empresa demo
- Reglas VIP para sitio específico
- Reglas 24/7 para empresa de soporte

## Testing

Los tests incluyen:
- Guardado y actualización exitosa
- Manejo de errores de base de datos
- Búsquedas por diferentes criterios
- Lógica de prioridad (sitio específico vs general)
- Filtrado por reglas activas/inactivas

```bash
npm run test:unit -- --testPathPattern="mongo-assignment-rules.repository.spec.ts"
```

## Consideraciones de Rendimiento

1. **Índices**: Optimizados para búsquedas frecuentes por empresa/sitio
2. **Proyecciones**: Usar proyecciones MongoDB para consultas específicas
3. **Caché**: Considerar caché Redis para reglas consultadas frecuentemente
4. **Límites**: Paginación para consultas que retornen muchas reglas

## Migración desde Implementación en Memoria

Para cambiar de `InMemoryAssignmentRulesRepository` a `MongoAssignmentRulesRepository`:

1. Actualizar provider en módulo:
```typescript
{
  provide: ASSIGNMENT_RULES_REPOSITORY,
  useClass: MongoAssignmentRulesRepository, // Cambiar aquí
}
```

2. Ejecutar script de migración para datos existentes
3. Verificar tests de integración
4. Monitorear logs en producción