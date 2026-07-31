# E2E Tests Guide — Frontend

This guide explains how to run end-to-end tests in the frontend repository against a
real, isolated backend — without touching staging, without a separate server, and
without any real credentials at risk.

---

## How it works

Every time the E2E workflow runs in GitHub Actions, it:

1. Checks out the **backend repository** into a temporary folder inside the runner.
2. Builds a Docker image of the backend and spins up a full stack
   (PostgreSQL + MongoDB + Redis + NestJS) **inside the runner itself**.
3. The backend automatically runs database migrations and seeds a test company
   with a known admin user before NestJS starts.
4. Playwright runs your tests against `http://localhost:3099` (backend) and
   whatever URL your frontend serves at (e.g. `http://localhost:4200`).
5. When the job finishes — or fails — Docker tears everything down. No data
   persists anywhere. No cleanup needed.

```
GitHub Actions runner (ubuntu-latest)
┌──────────────────────────────────────────────────────┐
│                                                      │
│  Docker network: e2e-net                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ postgres-e2e│  │ mongodb-e2e  │  │ redis-e2e  │  │
│  │  (tmpfs)    │  │   (tmpfs)    │  │  (tmpfs)   │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │
│         └────────────────┼────────────────┘          │
│                    ┌─────┴──────┐                    │
│                    │ backend-e2e│ :3099               │
│                    │  NestJS    │ ← migraciones       │
│                    │  + seed    │ ← empresa E2E       │
│                    └─────┬──────┘                    │
│                          │                           │
│              Playwright tests ← frontend             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Pre-seeded test credentials

The backend seeds these credentials automatically on every run.
They are **not secrets** — they only exist inside the ephemeral container.

| Field          | Value                        |
| -------------- | ---------------------------- |
| Admin email    | `admin@e2e.guiders.local`    |
| Admin password | `E2eAdmin123!`            |
| Backend URL    | `http://localhost:3099`      |
| Company domain | `e2e.guiders.local`          |

Use these values directly in your Playwright tests or in a `playwright.config.ts`
file — no secrets needed.

---

## Step 1 — Add the workflow file

Create `.github/workflows/e2e.yml` in the **frontend repository** with this content:

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

env:
  # These are not real secrets — they only exist inside the ephemeral Docker container.
  E2E_ADMIN_EMAIL: admin@e2e.guiders.local
  E2E_ADMIN_PASSWORD: E2eAdmin123!
  E2E_BASE_URL: http://localhost:4200   # Adjust to your frontend dev server port
  E2E_API_URL: http://localhost:3099

jobs:
  e2e:
    name: Playwright E2E
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout frontend
        uses: actions/checkout@v4

      # Check out the backend into a temporary folder.
      # The _backend folder is only used to spin up Docker — it is never deployed.
      - name: Checkout backend
        uses: actions/checkout@v4
        with:
          repository: ${{ secrets.BACKEND_REPO }}
          token: ${{ secrets.BACKEND_REPO_TOKEN }}
          path: _backend

      - name: Start backend E2E stack
        working-directory: _backend
        run: |
          docker compose -f docker/docker-compose.e2e.yml build --no-cache backend-e2e
          docker compose -f docker/docker-compose.e2e.yml up -d

      - name: Wait for backend to be healthy
        run: |
          timeout 120 bash -c '
            until curl -sf http://localhost:3099/api/tracking-v2/health > /dev/null; do
              sleep 3
            done
          '

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci --legacy-peer-deps

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run Playwright E2E tests
        env:
          PLAYWRIGHT_BASE_URL: ${{ env.E2E_BASE_URL }}
          E2E_ADMIN_EMAIL: ${{ env.E2E_ADMIN_EMAIL }}
          E2E_ADMIN_PASSWORD: ${{ env.E2E_ADMIN_PASSWORD }}
          E2E_API_URL: ${{ env.E2E_API_URL }}
        run: npx playwright test

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Teardown backend E2E stack
        if: always()
        run: |
          if [ -f "_backend/docker/docker-compose.e2e.yml" ]; then
            docker compose -f _backend/docker/docker-compose.e2e.yml down -v --remove-orphans
          else
            echo "⚠️  _backend/docker/docker-compose.e2e.yml no encontrado — nada que destruir"
          fi
```

---

## Step 2 — Add repository secrets

Go to **your frontend repository** → Settings → Secrets and variables → Actions →
New repository secret, and add these two:

| Secret name           | Value                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `BACKEND_REPO`        | The full name of the backend repo. Example: `acme-org/guiders-backend` |
| `BACKEND_REPO_TOKEN`  | A GitHub Personal Access Token (PAT) with `contents: read` scope on the backend repo. See [how to create a PAT](#how-to-create-the-pat) below. |

### How to create the PAT

1. Go to GitHub → your profile → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Set a name like `frontend-e2e-backend-read`.
3. Under **Repository access**, select **Only select repositories** and pick the
   backend repository.
4. Under **Permissions → Repository permissions**, set **Contents** to `Read-only`.
5. Generate the token, copy it immediately, and paste it as the `BACKEND_REPO_TOKEN`
   secret in the frontend repository.

> The token only allows reading the backend source code. It cannot write, delete,
> or access any other repository.

---

## Step 3 — Use the credentials in your Playwright tests

### Option A — `playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200',
  },
});
```

### Option B — Read them in a test or fixture

```ts
const adminEmail    = process.env.E2E_ADMIN_EMAIL    ?? 'admin@e2e.guiders.local';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'E2eAdmin123!';
const apiUrl        = process.env.E2E_API_URL         ?? 'http://localhost:3099';
```

You can hardcode the defaults directly — they are not sensitive.

### Option C — Log in via the API in a Playwright fixture

The backend exposes a direct login endpoint (no OIDC, no BFF flow needed for E2E):

```
POST http://localhost:3099/api/user/auth/login
Content-Type: application/json

{ "email": "admin@e2e.guiders.local", "password": "E2eAdmin123!" }
```

Response:
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<jwt>"
}
```

Example Playwright fixture:

```ts
import { test as base, request } from '@playwright/test';

export const test = base.extend({
  accessToken: async ({}, use) => {
    const ctx = await request.newContext();
    const res = await ctx.post('http://localhost:3099/api/user/auth/login', {
      data: {
        email: process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.guiders.local',
        password: process.env.E2E_ADMIN_PASSWORD ?? 'E2eAdmin123!',
      },
    });
    const { access_token } = await res.json();
    await use(access_token);
    await ctx.dispose();
  },
});
```

> **Do not use the BFF/OIDC flow** (`/api/bff/auth/...`) in E2E tests.
> That flow requires a real Keycloak server, which is not part of the E2E Docker stack.

---

## Step 4 — (Optional) Add `_backend` to `.gitignore`

The workflow checks out the backend into a folder called `_backend`. That folder
never gets committed, but adding it to `.gitignore` avoids accidental staging:

```
# .gitignore
_backend/
```

---

## Troubleshooting

### The backend never becomes healthy

The backend takes up to 2 minutes on a cold build (downloading base images,
compiling TypeScript, running migrations, seeding). If the 120-second timeout is
not enough, increase it in the workflow:

```yaml
- name: Wait for backend to be healthy
  run: |
    timeout 180 bash -c '   # ← increase from 120 to 180
        until curl -sf http://localhost:3099/api/tracking-v2/health > /dev/null; do
        sleep 3
      done
    '
```

### Docker build fails

Check that `docker compose` (v2 plugin) is available on the runner. `ubuntu-latest`
includes it by default. If you are on a self-hosted runner, install it manually:

```bash
sudo apt-get install -y docker-compose-plugin
```

### `BACKEND_REPO_TOKEN` permission denied

Make sure the PAT was created with **Contents: Read-only** on the correct repository
and that it has not expired. Fine-grained tokens expire after the date you set
(or after 1 year maximum).

### Port 3099 is already in use on the runner

This should not happen on GitHub-hosted runners because each job gets a fresh
virtual machine. On self-hosted runners, stop any conflicting service or change the
port in `docker/docker-compose.e2e.yml` and update `E2E_API_URL` in the workflow accordingly.

---

## Security model

| Question | Answer |
| -------- | ------ |
| Are the E2E credentials a security risk? | No. They only exist inside an ephemeral Docker container that is destroyed after the job. They never reach staging or production. |
| Is the backend source code exposed? | The PAT only grants `contents: read`. No write access, no secrets, no deployments. |
| What happens if the job is cancelled mid-run? | The `if: always()` teardown step still runs and destroys the Docker stack. |
| Does this affect the staging database? | No. The backend uses its own isolated PostgreSQL and MongoDB running in tmpfs inside Docker. |
