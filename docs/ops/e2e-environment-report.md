# E2E Test Environment — Connection Reference

**Generated:** 2026-05-22

---

## Environment Credentials

| Field | Value |
|---|---|
| **Company ID** | `19896f02-febb-4e44-84b9-91e957644f20` |
| **Site ID** | `3cc4c92e-2f52-46b5-99b6-f898935f950d` |
| **Canonical domain** | `e2e.guiders.local` |
| **Alias domains** | `www.e2e.guiders.local`, `staging.e2e.guiders.local` |
| **Admin email** | `e2e-admin@guiders.test` |
| **Admin password** | `E2eAdmin123!` |
| **API Key** | `40c7f31e1f9b278444500e213086e0aa82865206d3d74a41926c12cc026a762f` |

> These values are valid for the current environment state. If the backend team resets the database, new values will be provided.
>
> The admin user exists in **both** PostgreSQL and Keycloak. Login via SSO (Keycloak) works with the credentials above.

---

## Connecting from the Frontend

### Constants file

```typescript
// e2e/constants/env.ts
export const E2E = {
  companyId:     '19896f02-febb-4e44-84b9-91e957644f20',
  siteId:        '3cc4c92e-2f52-46b5-99b6-f898935f950d',
  domain:        'e2e.guiders.local',
  adminEmail:    'e2e-admin@guiders.test',
  adminPassword: 'E2eAdmin123!',
  apiKey:        '40c7f31e1f9b278444500e213086e0aa82865206d3d74a41926c12cc026a762f',
};
```

### Initialising the Guiders SDK

```javascript
Guiders.init({
  apiKey: '40c7f31e1f9b278444500e213086e0aa82865206d3d74a41926c12cc026a762f',
  domain: 'e2e.guiders.local',
});
```

### Logging in as admin (via Keycloak SSO)

```typescript
await page.fill('[name=email]', 'e2e-admin@guiders.test');
await page.fill('[name=password]', 'E2eAdmin123!');
await page.click('[type=submit]');
```

---

## Available Visitor Data

150 fake visitors are seeded with the following distribution:

| Lifecycle | Approx. % |
|---|---|
| `ANON` | ~30% |
| `ENGAGED` | ~30% |
| `LEAD` | ~30% |
| `CONVERTED` | ~10% |

Each visitor has a unique fingerprint, a random IP, one of 5 user-agents (Chrome, Safari, Firefox, iPhone, Android), a current URL from 7 possible pages, and GDPR consent accepted.

---

## What is NOT seeded

The following entities do not exist by default and must be created via the API or the admin dashboard if your tests need them:

- Chats / conversations
- CRM integrations
- Lead scoring rules
- Tracking events
