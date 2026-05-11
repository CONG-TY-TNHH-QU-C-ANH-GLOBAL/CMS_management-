# THG CMS Source Structure Base — Backend + Frontend + CMS + Agent

## 0. Mục tiêu

Tài liệu này chia source base cho hệ thống CMS của THG Fulfill:

```txt
CMS Admin UI
→ giao diện cho team quản lý content

Agent API
→ backend xử lý auth, permission, agent, Telegram, approval workflow

Directus CMS
→ headless CMS/database content

Landing Page
→ website public hiện tại, chỉ fetch dữ liệu published từ CMS
```

Nguyên tắc:

```txt
1. Landing page giữ UI hiện tại.
2. CMS Admin là app riêng cho team.
3. Directus lưu content.
4. Backend riêng xử lý agent, Telegram, quyền, workflow.
5. Agent chỉ tạo draft/change request, không publish trực tiếp.
6. Public website chỉ đọc published/active content.
7. Browser không bao giờ nhận Directus admin token.
```

---

## 1. Kiến trúc tổng thể

```txt
apps/
  cms-admin/     # Frontend CMS UI
  agent-api/     # Backend API + Agent + Telegram bot
  landing/       # Landing page hiện tại hoặc adapter fetch CMS

packages/
  shared/        # Shared types/constants/utils
  cms-client/    # Directus client wrapper
  ui/            # Shared UI components nếu cần
  config/        # Shared TS/ESLint/Tailwind config

infra/
  docker/
  directus/
  nginx/
  scripts/

docs/
  source-structure.md
  cms-schema.md
  api-contract.md
  roles-permissions.md
  agent-workflow.md
  telegram-workflow.md
  deployment.md
```

Khuyến nghị dùng monorepo:

```txt
pnpm workspace + Turborepo
```

---

## 2. Root folder

```txt
thg-content-os/
  apps/
    cms-admin/
    agent-api/
    landing/

  packages/
    shared/
    cms-client/
    ui/
    config/

  infra/
    docker/
    directus/
    nginx/
    scripts/

  docs/
    source-structure.md
    cms-schema.md
    api-contract.md
    roles-permissions.md
    agent-workflow.md
    telegram-workflow.md
    deployment.md

  .env.example
  .gitignore
  package.json
  pnpm-workspace.yaml
  turbo.json
  README.md
```

---

## 3. Root config

### `package.json`

```json
{
  "name": "thg-content-os",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "dev:admin": "pnpm --filter cms-admin dev",
    "dev:api": "pnpm --filter agent-api dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "latest",
    "prettier": "latest"
  },
  "packageManager": "pnpm@9.0.0"
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### `turbo.json`

```json
{
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "lint": {},
    "typecheck": {}
  }
}
```

---

## 4. App 1 — `apps/cms-admin`

Đây là frontend admin UI cho team.

Tech đề xuất:

```txt
Next.js
TypeScript
Tailwind CSS
shadcn/ui-style components
lucide-react icons
```

Structure:

```txt
apps/cms-admin/
  src/
    app/
      (auth)/
        login/
          page.tsx

      (dashboard)/
        layout.tsx

        dashboard/
          page.tsx

        content/
          landing/
            page.tsx
          blog/
            page.tsx
            [id]/
              page.tsx
          services/
            page.tsx
          pricing/
            page.tsx
          faqs/
            page.tsx
          policies/
            page.tsx
          catalog/
            page.tsx
          media/
            page.tsx

        agent/
          jobs/
            page.tsx
            [id]/
              page.tsx
          sources/
            page.tsx
          drafts/
            page.tsx
          change-requests/
            page.tsx
          prompt-templates/
            page.tsx

        reviews/
          page.tsx
          [id]/
            page.tsx

        settings/
          site/
            page.tsx
          users/
            page.tsx
          roles/
            page.tsx
          telegram/
            page.tsx
          webhooks/
            page.tsx
          audit-logs/
            page.tsx

    components/
      app-shell/
        AppShell.tsx
        Sidebar.tsx
        TopBar.tsx
        Breadcrumbs.tsx
        CommandPalette.tsx

      dashboard/
        DashboardStats.tsx
        PendingReviewQueue.tsx
        AgentActivityCard.tsx
        ContentHealthPanel.tsx

      content/
        landing/
          LandingEditor.tsx
          LandingSectionList.tsx
          LandingPreviewPanel.tsx
          LandingChangeRequestDrawer.tsx
        blog/
          BlogTable.tsx
          BlogEditor.tsx
          BlogSeoPanel.tsx
          BlogSourcePanel.tsx
          BlogAIAssistantPanel.tsx
        pricing/
          PricingTable.tsx
          PricingChangeRequestForm.tsx
          PricingApprovalPanel.tsx
        faqs/
          FAQTable.tsx
          FAQEditor.tsx
        services/
          ServiceTable.tsx
          ServiceEditor.tsx
        media/
          MediaLibrary.tsx
          MediaPicker.tsx

      agent/
        AskAgentModal.tsx
        AgentJobsTable.tsx
        AgentJobTimeline.tsx
        SourceInboxTable.tsx
        DraftQueue.tsx
        ChangeRequestTable.tsx
        PromptTemplateEditor.tsx

      reviews/
        ReviewQueue.tsx
        ReviewDetail.tsx
        DiffViewer.tsx
        ApprovalPanel.tsx

      settings/
        TelegramUsersTable.tsx
        CommandPermissionMatrix.tsx
        UsersTable.tsx
        RolesTable.tsx
        AuditLogTable.tsx
        WebhookStatusTable.tsx

      ui/
        Button.tsx
        Card.tsx
        Badge.tsx
        DataTable.tsx
        Modal.tsx
        Drawer.tsx
        Input.tsx
        Textarea.tsx
        Select.tsx
        Toast.tsx
        EmptyState.tsx
        ConfirmDialog.tsx

    lib/
      api/
        client.ts
        auth.ts
        dashboard.ts
        content.ts
        agent.ts
        reviews.ts
        settings.ts

      auth/
        session.ts
        permissions.ts
        guards.ts

      constants/
        routes.ts
        roles.ts
        statuses.ts

      hooks/
        useCurrentUser.ts
        usePermission.ts
        useToast.ts

      utils/
        cn.ts
        formatDate.ts
        diff.ts

    styles/
      globals.css

    middleware.ts

  public/
    logo.svg

  .env.local.example
  package.json
  tsconfig.json
  tailwind.config.ts
```

Frontend chỉ nên làm:

```txt
Render dashboard/editor/review UI
Call backend API
Show preview/diff
Check UI permission
Show audit logs
```

Frontend không nên làm:

```txt
Không gọi Directus admin token trực tiếp
Không gọi LLM trực tiếp từ browser
Không publish nếu backend chưa verify permission
Không xử lý Telegram webhook
```

---

## 5. Frontend API client

File:

```txt
apps/cms-admin/src/lib/api/client.ts
```

```ts
const API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL;

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_URL) {
    throw new Error("Missing NEXT_PUBLIC_AGENT_API_URL");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    throw new Error(`API request failed: ${res.status}`);
  }

  return res.json();
}
```

---

## 6. App 2 — `apps/agent-api`

Đây là backend chính.

Tech đề xuất:

```txt
Node.js
TypeScript
Fastify hoặc Express
Directus SDK / REST
OpenAI SDK
Telegram bot library
BullMQ + Redis hoặc queue đơn giản cho MVP
```

Structure:

```txt
apps/agent-api/
  src/
    main.ts
    server.ts

    config/
      env.ts
      logger.ts

    modules/
      auth/
        auth.controller.ts
        auth.service.ts
        session.service.ts
        permission.service.ts
        auth.middleware.ts

      users/
        users.controller.ts
        users.service.ts

      content/
        content.controller.ts
        content.service.ts
        landing.service.ts
        blog.service.ts
        pricing.service.ts
        faq.service.ts
        services.service.ts
        policies.service.ts

      reviews/
        reviews.controller.ts
        reviews.service.ts
        approval.service.ts
        diff.service.ts

      agent/
        agent.controller.ts
        agent.service.ts
        agent-orchestrator.ts
        prompt-builder.ts
        prompt-templates.service.ts

      agent-tools/
        search-sources.tool.ts
        fetch-url.tool.ts
        extract-article.tool.ts
        create-blog-draft.tool.ts
        update-blog-draft.tool.ts
        create-change-request.tool.ts
        update-cms-item.tool.ts
        send-telegram-preview.tool.ts
        revalidate-website.tool.ts

      sources/
        sources.controller.ts
        sources.service.ts
        source-extractor.service.ts
        credibility.service.ts

      telegram/
        telegram.bot.ts
        telegram.controller.ts
        telegram.service.ts
        telegram-auth.service.ts
        telegram-commands.ts
        telegram-callbacks.ts

      webhooks/
        directus-webhook.controller.ts
        revalidate.controller.ts
        webhooks.service.ts

      audit/
        audit.service.ts
        audit.controller.ts

      notifications/
        notifications.service.ts
        notifications.controller.ts

      jobs/
        queue.ts
        worker.ts
        job.service.ts

    integrations/
      directus/
        directus.client.ts
        directus.types.ts
        directus-content.repository.ts
        directus-users.repository.ts

      llm/
        llm.client.ts
        openai.provider.ts
        provider.types.ts
        tool-calling.ts

      search/
        search.client.ts

      telegram/
        telegram.client.ts

    policies/
      role-permissions.ts
      content-permissions.ts
      agent-permissions.ts
      pricing-permissions.ts

    utils/
      assert.ts
      errors.ts
      slugify.ts
      diff.ts
      sanitize.ts
      parse-youtube.ts
      retry.ts
      rate-limit.ts

  tests/
    agent/
    content/
    telegram/
    reviews/

  .env.example
  package.json
  tsconfig.json
```

Backend chịu trách nhiệm:

```txt
Auth/session
Permission enforcement
Directus API proxy cho action nhạy cảm
Agent orchestration
LLM tool calling
Telegram bot
Approval workflow
Change request apply
Audit logging
Source extraction
Website revalidation
Queue/retry/rate limit
```

Backend không nên:

```txt
Render admin UI
Cho agent dùng admin token
Cho browser gọi CMS admin token
Publish content không qua permission check
```

---

## 7. Backend API routes

Base:

```txt
/api
```

Auth:

```txt
POST   /auth/login
POST   /auth/logout
GET    /auth/me
GET    /auth/permissions
```

Dashboard:

```txt
GET    /dashboard/summary
GET    /dashboard/pending-reviews
GET    /dashboard/agent-activity
GET    /dashboard/content-health
```

Content:

```txt
GET    /content/landing
POST   /content/landing/change-request

GET    /content/blog
POST   /content/blog
GET    /content/blog/:id
PATCH  /content/blog/:id
POST   /content/blog/:id/request-review
POST   /content/blog/:id/publish
POST   /content/blog/:id/archive

GET    /content/services
POST   /content/services/change-request

GET    /content/pricing
POST   /content/pricing/change-request
POST   /content/pricing/:id/approve
POST   /content/pricing/:id/reject

GET    /content/faqs
POST   /content/faqs
PATCH  /content/faqs/:id

GET    /content/policies
POST   /content/policies
PATCH  /content/policies/:id
```

Reviews:

```txt
GET    /reviews
GET    /reviews/:id
POST   /reviews/:id/approve
POST   /reviews/:id/reject
POST   /reviews/:id/request-revision
POST   /reviews/:id/apply
```

Agent:

```txt
POST   /agent/run
GET    /agent/jobs
GET    /agent/jobs/:id
POST   /agent/jobs/:id/cancel
POST   /agent/jobs/:id/retry

GET    /agent/sources
POST   /agent/sources
POST   /agent/sources/:id/summarize

GET    /agent/drafts
GET    /agent/change-requests

GET    /agent/prompt-templates
POST   /agent/prompt-templates
PATCH  /agent/prompt-templates/:id
```

Telegram:

```txt
POST   /telegram/webhook
GET    /settings/telegram/users
POST   /settings/telegram/users/bind
PATCH  /settings/telegram/users/:id
GET    /settings/telegram/commands
PATCH  /settings/telegram/commands
```

Webhooks:

```txt
POST   /webhooks/directus
POST   /webhooks/revalidate
GET    /webhooks/status
```

Audit:

```txt
GET    /audit-logs
GET    /audit-logs/:id
```

---

## 8. App 3 — `apps/landing`

Nếu landing page hiện tại nằm cùng monorepo:

```txt
apps/landing/
  src/
    app/
      page.tsx
      blog/
        page.tsx
        [slug]/
          page.tsx
      api/
        revalidate/
          route.ts

    components/
      sections/
        Hero.tsx
        ServicesSection.tsx
        PricingSection.tsx
        FAQSection.tsx
        VideoSection.tsx
        CTASection.tsx

    lib/
      cms/
        homepage.ts
        services.ts
        pricing.ts
        faqs.ts
        videos.ts
        blog.ts
        fallback.ts
```

Nếu landing page đang ở repo riêng:

```txt
Không cần move vào monorepo ngay.
Chỉ cần copy hoặc import cms-client.
Refactor content hard-code thành fetch từ CMS.
```

Landing rule:

```txt
Landing page chỉ đọc published/active content.
Không dùng admin token.
Có cache/revalidate.
Có fallback content khi CMS lỗi.
```

---

## 9. Package — `packages/shared`

```txt
packages/shared/
  src/
    types/
      roles.ts
      content.ts
      agent.ts
      review.ts
      telegram.ts
      audit.ts

    constants/
      statuses.ts
      routes.ts
      permissions.ts

    utils/
      slugify.ts
      parse-youtube.ts
      format-date.ts
      diff.ts
      sanitize.ts

    index.ts

  package.json
  tsconfig.json
```

Dùng cho:

```txt
Shared types
Shared enums
Shared permissions
Shared utility functions
```

---

## 10. Package — `packages/cms-client`

```txt
packages/cms-client/
  src/
    directus-client.ts
    assets.ts

    queries/
      homepage.ts
      services.ts
      pricing.ts
      faqs.ts
      blog.ts
      policies.ts

    types.ts
    index.ts

  package.json
  tsconfig.json
```

Dùng cho:

```txt
Landing page public fetch
Backend Directus integration
Admin preview fetch nếu cần
```

Ví dụ:

```ts
export function getDirectusAssetUrl(fileId?: string | null) {
  if (!fileId) return "";
  return `${process.env.DIRECTUS_URL}/assets/${fileId}`;
}
```

---

## 11. Package — `packages/ui`

Có thể làm sau. MVP có thể để UI components trong `apps/cms-admin`.

Nếu cần shared UI:

```txt
packages/ui/
  src/
    components/
      Button.tsx
      Card.tsx
      Badge.tsx
      DataTable.tsx
      Modal.tsx
      Drawer.tsx
      Tabs.tsx
      Input.tsx
      Select.tsx
      Toast.tsx

    utils/
      cn.ts

    styles/
      globals.css

    index.ts
```

---

## 12. Directus CMS structure

```txt
infra/directus/
  extensions/
  schema/
    snapshot.yaml
  flows/
    revalidate-flow.json
  roles/
    roles.md
  permissions/
    permissions.md
```

Collections cần có:

```txt
site_settings
pages
homepage
homepage_stats
services
pricing_lines
faqs
youtube_videos
testimonials
policies
catalog_categories
catalog_products
cta_blocks
navigation_links

authors
blog_posts
source_items
agent_jobs
agent_logs
content_change_requests
editorial_reviews
telegram_identities
notifications
audit_events
prompt_templates
```

Nhóm public content:

```txt
homepage
services
pricing_lines
faqs
youtube_videos
policies
catalog_products
navigation_links
cta_blocks
```

Nhóm agent/editorial:

```txt
blog_posts
source_items
agent_jobs
agent_logs
content_change_requests
editorial_reviews
prompt_templates
```

Nhóm integration:

```txt
telegram_identities
notifications
audit_events
```

---

## 13. Infra structure

```txt
infra/
  docker/
    docker-compose.dev.yml
    docker-compose.prod.yml

  directus/
    schema/
    flows/
    roles/
    permissions/

  postgres/
    init.sql
    backups/
      README.md

  nginx/
    nginx.conf
    sites/
      cms-admin.conf
      api.conf
      directus.conf

  scripts/
    backup-db.sh
    restore-db.sh
    deploy.sh
    seed-directus.ts
    export-directus-schema.sh
```

---

## 14. Docker compose dev

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: thg_cms
      POSTGRES_USER: thg
      POSTGRES_PASSWORD: thg_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  directus:
    image: directus/directus:latest
    ports:
      - "8055:8055"
    environment:
      KEY: "replace_me"
      SECRET: "replace_me"
      ADMIN_EMAIL: "admin@thg.local"
      ADMIN_PASSWORD: "admin_password"
      DB_CLIENT: "pg"
      DB_HOST: "postgres"
      DB_PORT: "5432"
      DB_DATABASE: "thg_cms"
      DB_USER: "thg"
      DB_PASSWORD: "thg_password"
      PUBLIC_URL: "http://localhost:8055"
    depends_on:
      - postgres

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

---

## 15. Environment variables

Root `.env.example`:

```env
PUBLIC_SITE_URL=https://thgfulfill.com
CMS_ADMIN_URL=https://cms-admin.thgfulfill.com
AGENT_API_URL=https://api.thgfulfill.com
DIRECTUS_URL=https://cms.thgfulfill.com

DIRECTUS_ADMIN_EMAIL=
DIRECTUS_ADMIN_PASSWORD=
DIRECTUS_AGENT_TOKEN=
DIRECTUS_PUBLIC_READ_TOKEN=
DIRECTUS_REVALIDATE_SECRET=

POSTGRES_HOST=
POSTGRES_PORT=5432
POSTGRES_DB=thg_cms
POSTGRES_USER=
POSTGRES_PASSWORD=

AGENT_API_PORT=4000
SESSION_SECRET=
CORS_ORIGIN=https://cms-admin.thgfulfill.com

OPENAI_API_KEY=
LLM_DEFAULT_MODEL=

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_ALLOWED_CHAT_IDS=

REDIS_URL=

LANDING_REVALIDATE_URL=https://thgfulfill.com/api/revalidate
LANDING_REVALIDATE_SECRET=
```

Frontend `.env.local.example`:

```env
NEXT_PUBLIC_AGENT_API_URL=http://localhost:4000
NEXT_PUBLIC_CMS_ADMIN_NAME=THG Content OS
```

Backend `.env.example`:

```env
PORT=4000
DIRECTUS_URL=http://localhost:8055
DIRECTUS_AGENT_TOKEN=
OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
SESSION_SECRET=
REDIS_URL=
```

---

## 16. Auth flow

Khuyến nghị MVP:

```txt
Directus users là source of truth.
CMS Admin login bằng email/password.
agent-api authenticate với Directus.
agent-api tạo secure session cookie.
cms-admin gọi agent-api bằng cookie.
agent-api check role/permission trước mỗi action.
```

Không làm:

```txt
Không expose Directus admin token ra browser.
Không để browser gọi privileged Directus endpoints.
Không dùng Telegram username làm định danh chính.
Không để agent dùng token của người thật.
```

---

## 17. Permission flow

Ví dụ publish blog:

```txt
User clicks Publish Blog
→ cms-admin POST /content/blog/:id/publish
→ agent-api checks session
→ checks permission BLOG_PUBLISH
→ checks blog status review/approved
→ updates Directus blog_posts.status=published
→ writes audit event
→ triggers landing/blog revalidate
```

Permission constants:

```ts
export const PERMISSIONS = {
  BLOG_CREATE: "blog:create",
  BLOG_UPDATE_OWN: "blog:update_own",
  BLOG_PUBLISH: "blog:publish",

  HOMEPAGE_CHANGE_REQUEST_CREATE: "homepage_change_request:create",
  HOMEPAGE_CHANGE_APPLY: "homepage_change:apply",

  PRICING_CHANGE_REQUEST_CREATE: "pricing_change_request:create",
  PRICING_APPROVE: "pricing:approve",

  AGENT_RUN: "agent:run",
  AGENT_JOB_CANCEL: "agent_job:cancel",

  USERS_MANAGE: "users:manage"
} as const;
```

---

## 18. Agent workflow

Flow:

```txt
User/Telegram creates prompt
→ backend creates agent_jobs record
→ queue worker picks job
→ agent orchestrator parses task
→ tools execute
→ draft/change_request/source_items created in Directus
→ Telegram/CMS notification sent
→ status = waiting_review
```

Agent restrictions:

```txt
Allowed:
- create blog draft
- update own draft if status=draft/review
- create source item
- create change request
- send Telegram preview

Not allowed:
- publish CMS item
- delete CMS item
- update homepage directly
- update pricing directly
- manage users/roles/tokens
```

---

## 19. Telegram workflow

Commands:

```txt
/research <topic>
/draft <topic>
/rewrite <id> <instruction>
/seo <id>
/preview <id>
/approve <id>
/publish <id>
/reject <id> <reason>
/revise <id> <instruction>
/apply_change <id>
/agent_status
```

Auth:

```txt
telegram_user_id
→ lookup telegram_identities
→ linked cms_user_id
→ load CMS role
→ check backend permission
→ execute command
→ write audit event
```

Không rely vào Telegram username.

---

## 20. Development order

```txt
Phase 1: Monorepo setup
Phase 2: Directus local + PostgreSQL
Phase 3: CMS schema + roles
Phase 4: agent-api skeleton
Phase 5: Auth/session + permission guard
Phase 6: cms-admin frontend shell
Phase 7: Dashboard mock → real API
Phase 8: Content modules
Phase 9: Review workflow
Phase 10: Agent jobs + draft creation
Phase 11: Telegram bot
Phase 12: Landing page CMS fetch
Phase 13: Revalidate/webhook
Phase 14: Audit logs
Phase 15: Production deploy
```

---

## 21. MVP scope

Làm trước:

```txt
Directus CMS running

Collections:
- homepage
- services
- pricing_lines
- faqs
- blog_posts
- source_items
- agent_jobs
- content_change_requests
- telegram_identities

cms-admin:
- dashboard
- landing editor
- blog editor
- review queue
- agent jobs

agent-api:
- auth
- permission check
- create draft
- create change request
- approve/publish

telegram:
- /draft
- /preview
- /approve
- /publish

landing:
- fetch homepage/services/pricing/faqs/videos from CMS
```

Làm sau:

```txt
Advanced SEO scoring
Advanced analytics
Multi-language content
Complex campaign pages
Visual page builder
Complex source credibility scoring
Cost dashboard
```

---

## 22. Critical security rules

```txt
1. Browser never receives Directus admin token.
2. Agent token cannot publish.
3. Public website only reads published/active content.
4. Telegram user ID must be mapped to CMS user.
5. Every publish/apply action writes audit log.
6. Pricing changes require finance approval.
7. Homepage changes require manager/admin approval.
8. Directus public permissions exclude drafts/private fields.
9. Webhook secrets must be checked.
10. Sensitive env vars must not use NEXT_PUBLIC_ prefix.
```

---

## 23. Claude implementation prompt

Use this for Claude/Codex:

```txt
Implement the base source structure for THG Content OS as a pnpm monorepo.

Create:
- apps/cms-admin: Next.js + TypeScript + Tailwind admin UI skeleton
- apps/agent-api: Node.js + TypeScript backend API skeleton
- packages/shared: shared types/constants/utils
- packages/cms-client: Directus client wrapper
- infra/docker: local docker compose for PostgreSQL, Directus, Redis
- docs: architecture and API notes

Important:
- Do not build a generic CRUD-only CMS.
- Do not expose Directus admin token to the frontend.
- Use role-based permission guards.
- Agent can create drafts/change requests but cannot publish.
- Telegram actions must map telegram_user_id to CMS user.
- Landing page only reads published/active content.
- Add clear folder structure, placeholder controllers/services/components, and TODO comments.
- Keep the first implementation runnable locally.
```

---

## 24. Final recommended structure

```txt
thg-content-os/
  apps/
    cms-admin/              # CMS admin frontend
    agent-api/              # API, agent, Telegram, approval workflow
    landing/                # current landing page or adapter

  packages/
    shared/                 # shared types/constants
    cms-client/             # Directus client wrapper
    ui/                     # optional shared UI
    config/                 # shared config

  infra/
    docker/                 # compose files
    directus/               # schema/flows/permissions
    nginx/                  # reverse proxy
    scripts/                # seed/backup/deploy

  docs/
    source-structure.md
    cms-schema.md
    api-contract.md
    roles-permissions.md
    agent-workflow.md
    telegram-workflow.md
    deployment.md
```
