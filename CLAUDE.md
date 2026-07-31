# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

📚 **Documentation index**: [`docs/README.md`](docs/README.md)

## Quick Reference

### Critical Rules (ALWAYS follow)

1. **Result Pattern**: Use `Result<T, E>` instead of exceptions for expected errors
2. **Event Publishing**: Always call `commit()` after `mergeObjectContext()` + `save()`
3. **UUIDs in Tests**: Use `Uuid.random().value`, never fake IDs
4. **Mappers**: Never expose ORM entities outside infrastructure

### Anti-Patterns (BLOCK)

| Prohibited | Correct |
|------------|---------|
| Business logic in controllers | Delegate to CommandBus/QueryBus |
| `throw new Error()` for validations | `return err(new DomainError())` |
| Concatenated SQL | `CriteriaConverter` + QueryBuilder |
| Exposing ORM entities | Use mappers in infrastructure |
| Forgetting `commit()` | Always after `save()` |
| Importing infrastructure from domain | Only domain ← application ← infrastructure |

## Architecture Rules

**See `.claude/rules/` for detailed patterns and code examples.**

- **Domain**: Aggregates, Value Objects, Events, Errors, Repositories (interfaces)
- **Application**: Commands, Queries, Event Handlers, DTOs
- **Infrastructure**: Controllers, Repos (impl), Schemas, Entities, Services, Gateways
- **Shared**: Result, Optional, Criteria, Uuid

## Project Overview

**guiders-backend**: NestJS v11 with DDD + CQRS, multi-persistence (PostgreSQL + MongoDB), WebSocket.

Real-time communication infrastructure for sales teams and website visitors.

### Main Contexts

| Context | Persistence | Notes |
|---------|-------------|-------|
| `company` | PostgreSQL | Companies and sites |
| `auth` | PostgreSQL | User/visitor authentication |
| `conversations-v2` | MongoDB | Chat - **use for new features** |
| `visitors-v2` | MongoDB | Visitors - **use for new features** |
| `llm` | MongoDB | AI and Tool Use |
| `leads` | MongoDB | Lead management |
| `conversations` (V1) | PostgreSQL | Legacy - maintenance only |
| `visitors` (V1) | PostgreSQL | Legacy - maintenance only |

### Tech Stack

- NestJS v11 + TypeScript
- TypeORM (PostgreSQL) / Mongoose (MongoDB)
- Socket.IO (WebSocket)
- Jest (Testing)
- Redis (Cache)

## Development Commands

```bash
# Development
npm run start:dev              # Server with hot-reload
npm run build                  # Build
npm run lint && npm run format # Code quality

# Testing
npm run test:unit                              # Unit tests
npm run test:unit -- path/to/file.spec.ts      # Single test file
npm run test:unit -- --testNamePattern="test"  # Tests matching pattern
npm run test:int                               # Integration tests (requires DBs)
npm run test:e2e                               # E2E tests

# Database
npm run typeorm:migrate:run       # Run migrations
npm run typeorm:migrate:generate  # Generate migration

# CLI Tools
node bin/guiders-cli.js create-company --name "Company" --domain "example.com"
node bin/guiders-cli.js create-company-with-admin --name "Company" --domain "example.com" --adminName "Admin" --adminEmail "admin@example.com"
node bin/guiders-cli.js clean-database --force  # Caution: clears all data
```

## Language Policy

| Element | Language |
|---------|----------|
| Code identifiers | English |
| Comments and docs | Spanish |
| Swagger | Spanish |
| Error messages | Spanish |

## Pre-Commit Checklist

- [ ] Result pattern used correctly (no exceptions)
- [ ] `commit()` called after `save()` in command handlers
- [ ] Repositories use mappers (don't expose ORM entities)
- [ ] Event handlers follow `<Action>On<Event>EventHandler` naming
- [ ] Tests use `Uuid.random().value` (no fake UUIDs)
- [ ] `npm run lint` and `npm run format` without errors
- [ ] New features in V2 contexts (not V1)
