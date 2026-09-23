# AGENTS.md - Company Context

Organization and workspace management for the Guiders platform. Handles company creation, team management, settings, and subscription information.

**Parent documentation**: [Root AGENTS.md](../../AGENTS.md)

## Context Overview

The Company context is responsible for:

- Company creation and management
- Team member organization
- Workspace settings and configuration
- Subscription and billing status
- Feature access control (feature flags)
- Multi-tenancy isolation

This context is **foundational for multi-tenancy** and used by all feature contexts to scope data.

## Directory Structure

```
src/context/company/
├── domain/
│   ├── company.aggregate.ts    # Main Company aggregate
│   ├── company.repository.ts   # Repository interface
│   ├── entities/               # Sub-entities (Team, Plan)
│   ├── value-objects/          # CompanyId, Domain, Status, etc.
│   ├── events/                 # Domain events
│   └── errors/                 # Domain-specific errors
├── application/
│   ├── commands/               # Create, update company operations
│   ├── queries/                # Read operations
│   ├── events/                 # Event handlers
│   └── dtos/                   # API contracts
└── infrastructure/
    ├── controllers/            # HTTP endpoints
    ├── persistence/            # Repository implementations
    └── services/               # External integrations (billing, etc.)
```

## Domain Entities

### Company Aggregate (Root)

```typescript
// src/context/company/domain/company.aggregate.ts
Company {
  id: CompanyId (UUID)
  name: string
  domain: Domain (unique, www.example.com)
  logo: Logo (optional, image URL)
  status: CompanyStatus (ACTIVE, SUSPENDED, DELETED)
  plan: Plan (FREE, STARTER, PROFESSIONAL, ENTERPRISE)
  subscription: Subscription
  settings: CompanySettings
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  adminId: UserId (primary admin)
}
```

### Team Entity

```typescript
// Sub-entity within Company
Team {
  id: TeamId (UUID)
  companyId: CompanyId
  name: string
  description: string
  members: Member[]
  createdAt: Date
  updatedAt: Date
}
```

### Member Entity

```typescript
// Represents a user in a team
Member {
  id: MemberId (UUID)
  userId: UserId
  teamId: TeamId
  role: Role (ADMIN, MANAGER, MEMBER, VIEWER)
  permissions: Permission[]
  joinedAt: Date
}
```

### Subscription Entity

```typescript
// Billing and subscription info
Subscription {
  id: SubscriptionId (UUID)
  companyId: CompanyId
  plan: Plan (FREE, STARTER, PROFESSIONAL, ENTERPRISE)
  status: SubscriptionStatus (ACTIVE, CANCELED, EXPIRED)
  currentPeriodStart: Date
  currentPeriodEnd: Date
  nextBillingDate: Date
  canceledAt: Date | null
}
```

## Value Objects

- `CompanyId` - Unique company identifier
- `Domain` - Company domain (must be unique)
- `CompanyStatus` - Status enum (ACTIVE, SUSPENDED, DELETED)
- `Plan` - Subscription plan type
- `Logo` - Image URL with validation
- `CompanySettings` - Configuration object (timezone, language, theme)
- `Permission` - Specific permission (read, write, delete, manage)

## Key Use Cases

### Company Management

- **Create Company**: Initialize new workspace with admin user
- **Update Company Info**: Change name, logo, settings
- **Suspend Company**: Restrict access (admin or system only)
- **Delete Company**: Soft-delete with data retention
- **Archive Company**: Move to history without losing data

### Team Management

- **Create Team**: Organize members into groups
- **Add Member**: Invite user to company/team
- **Remove Member**: Revoke access
- **Update Member Role**: Change permissions
- **List Members**: View team composition

### Subscription Management

- **Change Plan**: Upgrade or downgrade subscription
- **Cancel Subscription**: Stop billing
- **Update Billing Info**: Credit card, contact details
- **View Usage**: Check resource consumption against plan limits

## Commands

### Company Management

- `CreateCompanyCommand` → Initialize company
- `UpdateCompanyCommand` → Modify company info
- `UpdateCompanySettingsCommand` → Change configuration
- `SuspendCompanyCommand` → Restrict access
- `DeleteCompanyCommand` → Soft-delete
- `ArchiveCompanyCommand` → Move to history

### Team Management

- `CreateTeamCommand` → New team
- `AddTeamMemberCommand` → Invite user
- `RemoveTeamMemberCommand` → Revoke access
- `UpdateTeamMemberRoleCommand` → Change permissions
- `DeleteTeamCommand` → Remove team

### Subscription Management

- `ChangePlanCommand` → Upgrade/downgrade
- `CancelSubscriptionCommand` → Stop billing
- `UpdateBillingInfoCommand` → Modify payment method

## Queries

### Company Information

- `GetCompanyByIdQuery` → Fetch company details
- `GetCompanyByDomainQuery` → Look up by domain
- `GetCompanySettingsQuery` → Retrieve configuration
- `ListCompaniesQuery` → Admin list all companies

### Team & Members

- `GetTeamQuery` → Fetch team details
- `ListTeamMembersQuery` → Members in team
- `GetMemberQuery` → Specific member info
- `ListCompanyMembersQuery` → All members in company

### Subscription & Billing

- `GetSubscriptionQuery` → Current subscription details
- `GetUsageQuery` → Resource consumption
- `GetBillingHistoryQuery` → Past transactions

## Events

- `CompanyCreatedEvent` → Company initialized
- `CompanyUpdatedEvent` → Info changed
- `CompanySettingsUpdatedEvent` → Configuration changed
- `CompanyStatusChangedEvent` → Suspended/deleted
- `TeamCreatedEvent` → New team
- `TeamMemberAddedEvent` → User added to team
- `TeamMemberRemovedEvent` → User removed from team
- `TeamMemberRoleUpdatedEvent` → Permissions changed
- `SubscriptionChangedEvent` → Plan changed
- `SubscriptionCanceledEvent` → Billing stopped

## Database Schema (PostgreSQL)

### companies table

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  logo_url VARCHAR(255),
  status VARCHAR(50) DEFAULT 'ACTIVE',
  plan VARCHAR(50) DEFAULT 'FREE',
  admin_id UUID NOT NULL REFERENCES users(id),
  settings JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_companies_domain ON companies(domain);
CREATE INDEX idx_companies_admin_id ON companies(admin_id);
```

### teams table

```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_teams_company_id ON teams(company_id);
```

### team_members table

```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) NOT NULL,
  permissions JSONB DEFAULT '[]',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);
```

### subscriptions table

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id),
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  next_billing_date TIMESTAMP,
  canceled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Integration Points

| Context          | Purpose                     | Method               |
| ---------------- | --------------------------- | -------------------- |
| auth             | User in company             | Membership check     |
| leads            | Leads belong to company     | Foreign key          |
| conversations-v2 | Chats scoped to company     | Tenant ID filter     |
| visitors-v2      | Visitors scoped to company  | Tenant ID filter     |
| tracking-v2      | Analytics scoped to company | Tenant ID filter     |
| commercial       | Billing info for company    | Subscription queries |
| white-label      | Customization per company   | Settings lookup      |

## Multi-Tenancy Enforcement

**CRITICAL**: All queries must include company ID filter:

```typescript
// CORRECT - includes companyId
async findLeads(companyId: CompanyId, filters: any) {
  return this.repository.find({ companyId, ...filters });
}

// INCORRECT - missing companyId, data leak!
async findLeads(filters: any) {
  return this.repository.find(filters);
}
```

Decorator to enforce automatic tenant scoping:

```typescript
@Scoped // Custom decorator that extracts companyId from request
async getLeads(@Param('companyId') companyId: string) {
  // companyId automatically added to queries
}
```

## Testing Strategy

### Unit Tests

```bash
npm run test:unit -- src/context/company/**/*.spec.ts
```

Test domain logic:

- Company creation with validation
- Team member role validation
- Subscription plan transitions
- Settings update logic

### Integration Tests

```bash
npm run test:int -- src/context/company/**/*.spec.ts
```

Test persistence:

- Company CRUD operations
- Team member queries
- Subscription state changes
- Multi-tenancy isolation

### E2E Tests

```bash
npm run test:e2e
```

Test endpoints:

- POST /companies
- GET /companies/:id
- PUT /companies/:id
- POST /companies/:id/members
- POST /companies/:id/change-plan

## Security Guidelines

### Team Member Access

```typescript
// Verify user belongs to company before allowing access
const isMember = await this.checkMembership(userId, companyId);
if (!isMember) return err(new UnauthorizedError());
```

### Admin-Only Operations

```typescript
// Suspend, delete, or plan changes require ADMIN role
const hasAdminRole = member.role === Role.ADMIN;
if (!hasAdminRole) return err(new ForbiddenError());
```

### Data Isolation

```typescript
// Never expose other company's data
const results = await repo.find({ companyId });
// Always filter by company
```

## Common Patterns

### Adding Team Member with Initial Role

```typescript
const memberResult = await handler.execute(
  new AddTeamMemberCommand(teamId, userId, Role.MEMBER),
);
if (memberResult.isErr()) return memberResult;
const member = memberResult.unwrap();
// Event fired: TeamMemberAddedEvent
```

### Changing Subscription Plan

```typescript
const changeResult = await handler.execute(
  new ChangePlanCommand(companyId, newPlan),
);
if (changeResult.isErr()) return changeResult;
// Event fired: SubscriptionChangedEvent
// Charge customer immediately if upgrade
```

### Listing Company Members with Filters

```typescript
const query = new ListCompanyMembersQuery(companyId, {
  role: Role.ADMIN,
  status: 'ACTIVE',
});
const members = await this.queryBus.execute(query);
```

## Known Limitations

- Manual team member approval flow not implemented
- No automatic team creation from templates
- Subscription downgrade doesn't prorate refunds
- Member invitation tokens stored in-memory (not persisted)
- No bulk member operations (import/export)
- Company data export not fully implemented

## Future Enhancements

1. **Audit logs** - Track all company-level changes
2. **Webhooks** - Notify on company events
3. **SSO integration** - SAML/OpenID Connect support
4. **Advanced roles** - Custom role builder with granular permissions
5. **Team invitations** - Link-based member onboarding
6. **Usage analytics** - Real-time resource consumption
7. **Data residency** - Choose storage location per company

## Related Documentation

- [Auth Context](../auth/AGENTS.md) - User authentication
- [Leads Context](../leads/AGENTS.md) - Lead management per company
- [Widget config](../../../docs/company/widget-config.md) - Chat web (Console admin; pixel GET público)
- [Root AGENTS.md](../../AGENTS.md) - Architecture overview

## Troubleshooting

### Cannot add member to team

- Verify user exists in auth context
- Check user is not already a member
- Ensure company is ACTIVE (not suspended)

### Company domain already exists

- Domain must be globally unique
- Check if company was soft-deleted (restore or use different domain)

### Plan downgrade fails

- Check for non-included features in current plan
- May need to delete resources before downgrading
- Contact support for manual intervention
