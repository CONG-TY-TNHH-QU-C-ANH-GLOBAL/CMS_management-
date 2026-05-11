# THG Content OS — Premium UX Design Spec for CMS + Agentic Content Workflow

## 0. Mục tiêu sản phẩm

Xây dựng giao diện CMS management cho THG Fulfill, dùng để quản lý landing page, blog, service, pricing, FAQ, policy, catalog, media và các bản nháp do LLM agent tạo ra.

Đây không phải là một CMS CRUD thông thường. UI cần giống một hệ thống SaaS vận hành nội dung chuyên nghiệp: có workflow duyệt, phân quyền, review AI draft, kiểm soát thay đổi landing page, kiểm soát pricing, và tích hợp Telegram.

Mục tiêu chính:

```txt
1. Team có thể chỉnh nội dung website mà không cần sửa code.
2. Giao diện landing page public vẫn giữ nguyên.
3. Agent chỉ tạo draft/proposal, không tự publish.
4. Nội dung quan trọng phải có review trước khi public.
5. Mỗi thay đổi đều truy vết được ai tạo, ai duyệt, ai publish.
6. Telegram chỉ là kênh điều khiển/review nhanh, không thay thế hệ thống quyền trong CMS.
```

Tên UI đề xuất:

```txt
THG Content OS
```

---

## 1. Định hướng UX tổng thể

UI cần đạt cảm giác:

```txt
Modern SaaS admin
Clean
Fast
Professional
Operational
Trustworthy
Enterprise-grade
```

Không nên giống:

```txt
Template admin rẻ tiền
CRUD dashboard đơn điệu
Page builder kéo thả phức tạp
CMS quá kỹ thuật khiến nhân viên khó dùng
```

Các nguyên tắc UX bắt buộc:

```txt
Draft-first
Preview-before-publish
Role-based actions
Human approval for AI content
Audit trail for risky actions
No raw HTML/script editing for normal users
No direct agent publish
```

---

## 2. Người dùng và phân quyền UX

### 2.1. Super Admin

Dành cho founder/technical owner.

Được thấy:

```txt
Dashboard
All content modules
Users & Roles
Telegram integration
Webhooks
Audit logs
Agent settings
System settings
```

Được làm:

```txt
Manage users
Manage roles
Manage tokens
Manage schema/settings
Publish any content
Apply any change request
View all logs
```

Không nên dùng tài khoản này để viết bài hằng ngày.

---

### 2.2. Developer / Technical Admin

Được thấy:

```txt
CMS API settings
Webhook status
Revalidate logs
Agent logs
Integration settings
Audit logs
```

Được làm:

```txt
Debug failed webhooks
Check agent errors
Configure integrations
View technical logs
```

Không phải người duyệt nội dung marketing mặc định.

---

### 2.3. Content Manager

Đây là vai trò chính để vận hành content.

Được thấy:

```txt
Dashboard
Landing Page
Blog Posts
Services
FAQ
Policies
Reviews
Agent Studio
SEO
Media
```

Được làm:

```txt
Approve drafts
Reject drafts
Request revisions
Publish blog posts
Apply approved landing page changes
Publish FAQ/service/policy content
Review AI-generated content
```

---

### 2.4. Content Writer

Được thấy:

```txt
Blog Posts
FAQ drafts
Media Library
Agent prompt tools
Own drafts
Review status
```

Được làm:

```txt
Create draft
Edit own draft
Use AI assistant
Request review
Upload media
Preview content
```

Không được làm:

```txt
Publish
Apply homepage changes
Change pricing
Manage users
Manage integrations
```

---

### 2.5. Sales / Ops Staff

Được thấy:

```txt
FAQ
Services
Pricing notes
Content change requests
Own requests
```

Được làm:

```txt
Suggest FAQ changes
Suggest service copy changes
Create pricing change request
Comment on operational content
```

Không được publish trực tiếp.

---

### 2.6. Finance / Pricing Owner

Được thấy:

```txt
Pricing
Pricing change requests
Pricing audit history
```

Được làm:

```txt
Approve pricing changes
Reject pricing changes
Request pricing revision
Set effective date
```

Không nhất thiết được quản lý blog hoặc homepage.

---

### 2.7. Agent Service Account

Không có UI người dùng.

Chỉ dùng API.

Được làm:

```txt
Create agent jobs
Create source items
Create blog drafts
Create content change requests
Create agent logs
Update own draft while status = draft/review
```

Không được làm:

```txt
Publish
Delete
Manage users
Manage roles
Change pricing directly
Change homepage directly
Change public content directly
```

---

## 3. Information Architecture

Sidebar chính:

```txt
Dashboard

Content
  - Landing Page
  - Blog Posts
  - Services
  - Pricing
  - FAQ
  - Policies
  - Catalog
  - Media Library

Agent Studio
  - Agent Jobs
  - Source Inbox
  - Draft Queue
  - Change Requests
  - Prompt Templates

Reviews
  - Pending Review
  - Approved
  - Rejected
  - Published History

Growth
  - SEO
  - CTA Blocks
  - Navigation Links
  - Campaign Pages

Settings
  - Site Settings
  - Users & Roles
  - Telegram Integration
  - Webhooks
  - Audit Logs
```

Sidebar cần có:

```txt
Collapsed mode
Active route highlight
Notification badges
Role-based hidden items
```

Ví dụ badge:

```txt
Pending Review: 7
Agent Jobs: 3 running
Change Requests: 5
Pricing Requests: 2
```

---

## 4. App Shell

Layout desktop:

```txt
┌──────────────────────────────────────────────────────────────┐
│ Sidebar │ Top Bar                                             │
│         ├─────────────────────────────────────────────────────┤
│         │ Page content                                        │
│         │                                                     │
│         │                                                     │
└─────────┴─────────────────────────────────────────────────────┘
```

Top bar gồm:

```txt
Breadcrumb
Global search
Ask Agent button
Create button
Notifications
User menu
```

Command palette:

```txt
Shortcut: Cmd/Ctrl + K
```

Commands:

```txt
Create blog post
Ask agent
Open pending reviews
Open homepage editor
Open pricing requests
Open audit logs
Revalidate website
Search source inbox
```

---

## 5. Dashboard

Dashboard phải trả lời được:

```txt
Việc nào cần duyệt?
Agent đang làm gì?
Nội dung nào vừa publish?
Có thay đổi pricing/homepage nào đang chờ không?
Content nào thiếu SEO/source?
Có lỗi webhook/agent không?
```

### 5.1. KPI cards

Cards:

```txt
Published Posts
Pending Reviews
Running Agent Jobs
Pending Homepage Changes
Pricing Requests
Content Needs Update
```

Mỗi card có:

```txt
Number
Small trend
Status badge
Click-through action
```

Ví dụ:

```txt
Pending Reviews
7 items
+3 today
[Review now]
```

### 5.2. Pending Review Queue

Columns:

```txt
Title
Type
Created by
Source: Human / Agent / Telegram
Risk Level
Updated At
Status
Actions
```

Risk:

```txt
Low: blog draft
Medium: FAQ/service wording
High: pricing
Critical: homepage hero / policy
```

Actions:

```txt
Preview
Review
Approve
Reject
Request Revision
```

### 5.3. Agent Activity Widget

Hiển thị:

```txt
Running jobs
Queued jobs
Failed jobs
Last successful draft
Source extraction status
Estimated token/cost
```

Ví dụ:

```txt
Researching: Fulfillment trend for POD sellers
Drafting: How to ship from Vietnam to US
Failed: Extract article from URL
```

### 5.4. Content Health

Checklist:

```txt
Blog posts missing SEO
Posts missing sources
FAQ outdated
Pricing not reviewed recently
Homepage has pending changes
Failed revalidations
```

---

## 6. Landing Page Editor

Mục tiêu: chỉnh content landing page nhưng không phá UI.

Layout đề xuất:

```txt
┌────────────────────────────────────────────────────────────┐
│ Landing Page Editor                        Preview: Desktop │
├───────────────┬────────────────────────────┬───────────────┤
│ Sections      │ Structured Editor          │ Live Preview  │
│               │                            │               │
│ Hero          │ Hero Title                 │ [Page view]   │
│ Stats         │ Hero Description           │               │
│ Services      │ CTA Button                 │               │
│ Pricing       │ Hero Image                 │               │
│ Video         │ YouTube URL                │               │
│ FAQ           │ SEO fields                 │               │
│ CTA           │                            │               │
└───────────────┴────────────────────────────┴───────────────┘
```

### 6.1. Section list

Sections:

```txt
Hero
Trust Badges
Stats
Services Intro
Pricing Intro
Video Section
FAQ Intro
CTA Block
Footer Content
SEO Metadata
```

Mỗi section hiển thị:

```txt
Status
Last edited
Pending change badge
Locked layout indicator
```

Ví dụ:

```txt
Hero
Pending change
Edited by Agent
2 hours ago
```

### 6.2. Field types

Dùng field có cấu trúc:

```txt
Short text
Long text
Markdown
Image picker
YouTube URL
CTA button group
Toggle
Select
Repeater list
```

Không cho nhân viên nhập:

```txt
Raw HTML
Script
CSS
Iframe code
JSON field
```

### 6.3. Locked layout message

Hiển thị rõ:

```txt
Layout is locked. You can safely edit text, images, buttons, and video links without changing the public design.
```

### 6.4. Change request

Các phần high-risk không update trực tiếp:

```txt
Hero title
Hero CTA
Service positioning
Pricing headline
Policy summary
Homepage SEO
```

Flow:

```txt
Edit
→ Save as Change Request
→ Manager reviews Before/After
→ Approve
→ Apply
→ Website revalidate
```

### 6.5. Preview modes

```txt
Desktop
Tablet
Mobile
SEO
Before/After
```

Before/After diff:

```txt
Field: hero_title

Before:
Shipping & Fulfillment for Global Sellers

After:
Cross-border Fulfillment for POD Sellers Shipping to the US
```

---

## 7. Blog Management

### 7.1. Blog list

Filters:

```txt
Status
Author
Human / Agent
Category
Tag
Date
Needs review
Source missing
SEO incomplete
```

Columns:

```txt
Title
Status
Author
Created by
SEO Score
Source Count
Last Updated
Published At
Actions
```

Actions:

```txt
Edit
Preview
Send to Review
Publish
Archive
Duplicate
Ask Agent
```

### 7.2. Blog editor layout

```txt
┌────────────────────────────────────────────────────────────┐
│ Blog Editor                                                 │
├─────────────────────────────────────┬──────────────────────┤
│ Main Editor                         │ Right Panel           │
│                                     │                      │
│ Title                               │ AI Assistant          │
│ Slug                                │ SEO Score             │
│ Excerpt                             │ Sources               │
│ Cover Image                         │ Review Checklist      │
│ Content Editor                      │ Publish Controls      │
│                                     │                      │
└─────────────────────────────────────┴──────────────────────┘
```

### 7.3. Fields

```txt
Title
Slug
Excerpt
Content
Cover image
Category
Tags
Public author
SEO title
SEO description
Canonical URL
Source references
Fact-check notes
Status
```

### 7.4. AI Assistant Panel

Tabs:

```txt
Brief
Outline
Rewrite
SEO
Sources
Fact-check
Translation
```

Actions:

```txt
Generate outline
Rewrite selected section
Improve title
Generate SEO metadata
Suggest FAQ
Summarize sources
Check claim-source alignment
Translate to Vietnamese
Translate to English
```

### 7.5. Publish blockers

Block publish if:

```txt
Title missing
Slug missing
Content too short
SEO title missing
SEO description missing
Public author missing
Agent-generated but not reviewed
Source-required post has no sources
```

Warn if:

```txt
No cover image
No CTA block
No internal links
Meta description too long
Slug changed after publish
```

---

## 8. Agent Studio

Agent Studio là nơi vận hành LLM workflow.

Sections:

```txt
Agent Jobs
Source Inbox
Draft Queue
Change Requests
Prompt Templates
Agent Settings
```

### 8.1. Ask Agent modal

Fields:

```txt
Task Type
Prompt
Target Content Type
Language
Tone
Sources
Output Length
Require Approval
```

Task types:

```txt
Research blog
Rewrite blog
Create FAQ
Summarize URL
Generate SEO metadata
Suggest homepage copy
Suggest service copy
Suggest pricing explanation
Translate content
```

Target content:

```txt
Blog post
Homepage section
Service
FAQ
Pricing note
Policy draft
Catalog description
```

Example:

```txt
Task Type: Research blog
Topic: Fulfillment trends for POD sellers shipping to the US
Language: English
Tone: Professional, direct
Sources: Official sources + selected URLs
Output: 1000 words
Approval: Required
[Run Agent]
```

### 8.2. Agent Jobs page

Columns:

```txt
Job ID
Task
Requested By
Source: CMS / Telegram / Schedule
Status
Progress
Target
Started At
Updated At
Actions
```

Statuses:

```txt
Queued
Running
Waiting for Source
Draft Created
Waiting Review
Approved
Failed
Cancelled
```

Actions:

```txt
View
Cancel
Retry
Open Draft
View Logs
```

### 8.3. Agent Job Detail

Sections:

```txt
Original prompt
Parsed task
Tool timeline
Sources used
Generated output
Created CMS items
Errors
Token/cost estimate
Reviewer actions
```

Timeline example:

```txt
1. Parsed prompt
2. Searched sources
3. Extracted 5 source items
4. Created outline
5. Generated draft
6. Created blog_posts item
7. Sent Telegram preview
```

### 8.4. Source Inbox

Fields:

```txt
Title
Source Name
URL
Published Date
Collected Date
Credibility Score
Used In Posts
Status
```

Statuses:

```txt
New
Reviewed
Used
Rejected
Archived
```

Actions:

```txt
Summarize
Use in blog
Reject
Open source
Attach to post
```

### 8.5. Draft Queue

Card view.

Card content:

```txt
Title
Content type
Generated prompt
Sources count
Risk level
Created time
Preview snippet
Actions
```

Actions:

```txt
Open
Approve
Revise with AI
Reject
Send to Telegram
```

### 8.6. Change Requests

Used for:

```txt
Landing page changes
Service copy changes
FAQ changes
Pricing changes
Policy changes
```

Columns:

```txt
Target
Requested by
Created by: Human / Agent
Risk level
Status
Last updated
Actions
```

Change detail must show:

```txt
Before content
After content
Changed fields
Reason
Requester
Reviewer
Apply button
Reject button
Revision comments
```

---

## 9. Telegram Integration UI

### 9.1. Settings page

Sections:

```txt
Bot Status
Connected Chats
Authorized Users
Command Permissions
Recent Telegram Actions
```

### 9.2. Authorized Users Table

Columns:

```txt
Telegram Name
Telegram User ID
CMS User
CMS Role
Allowed Chats
Status
Last Seen
Actions
```

Actions:

```txt
Bind to CMS user
Deactivate
Restrict commands
View activity
```

### 9.3. Command permission matrix

Commands:

```txt
/draft
/rewrite
/research
/seo
/preview
/approve
/publish
/reject
/revise
/apply_change
/revalidate
/agent_status
```

Role permissions:

```txt
Writer:
- draft
- rewrite
- preview

Content Manager:
- approve
- publish
- reject
- revise
- apply_change

Finance:
- approve_pricing
- reject_pricing

Admin:
- all commands
```

### 9.4. Telegram preview flow

When agent sends preview to Telegram, message should include:

```txt
Open in CMS
Approve
Request Revision
Reject
Publish
```

CMS should show Telegram message history for the item.

---

## 10. Pricing Management UX

Pricing is high-risk.

### 10.1. Pricing list

Filters:

```txt
Active
Draft
Pending Approval
Archived
Destination
Shipping Line
Service Type
```

Columns:

```txt
Line Name
Origin
Destination
Estimated Time
Price From
Status
Last Edited
Approved By
Actions
```

### 10.2. Pricing edit behavior

Sales/Ops:

```txt
Can create pricing change request.
Cannot update live pricing directly.
```

Finance:

```txt
Can approve or reject pricing.
Can request revision.
```

Content Manager/Admin:

```txt
Can publish approved pricing.
```

### 10.3. Pricing request detail

Show:

```txt
Before price
After price
Before condition
After condition
Effective date
Reason
Requester
Approver
```

Require:

```txt
Reason for change
Effective date
Finance approval
```

---

## 11. Services Management UX

### 11.1. Service list

Display as cards or table.

Fields:

```txt
Service name
Short description
Status
Featured
Last updated
Actions
```

Services examples:

```txt
Express
Fulfillment
Warehouse
Dropship / POD Support
China Sourcing
US Shipping
```

### 11.2. Service editor

Fields:

```txt
Name
Slug
Short title
Description
Long description
Target customer
Route name
Icon
Image
Button text
Button link
Featured toggle
Active toggle
SEO fields
```

Normal staff can suggest changes. Content Manager/Admin publishes.

---

## 12. FAQ Management UX

### 12.1. FAQ list

Features:

```txt
Category tabs
Drag-and-drop reorder
Search
Bulk activate/deactivate
```

Categories:

```txt
General
Shipping
Fulfillment
Warehouse
Pricing
Policy
Catalog
```

### 12.2. FAQ editor

Fields:

```txt
Question
Answer
Category
Sort order
Active toggle
Related service
Internal note
```

### 12.3. AI helper

Actions:

```txt
Generate FAQ from blog
Rewrite answer shorter
Translate FAQ
Suggest FAQ from customer questions
```

---

## 13. Policy Management UX

### 13.1. Policy list

Columns:

```txt
Title
Version
Status
Effective date
Last reviewed
Published by
Actions
```

### 13.2. Policy editor

Fields:

```txt
Title
Slug
Summary
Content
Version
Effective date
Status
Review note
```

### 13.3. Publish rules

Policy publish requires:

```txt
Manager/Admin role
Version number
Effective date
Review note
```

Optional:

```txt
Legal/owner approval
```

---

## 14. Media Library UX

### 14.1. Features

```txt
Grid view
List view
Upload
Search
Filter by type
Alt text
Usage count
Replace file
Copy asset URL
```

### 14.2. Metadata

```txt
File
Title
Alt text
Folder
Tags
Uploaded by
Used in
```

### 14.3. Image picker

When selecting images:

```txt
Show aspect ratio recommendation
Warn if image too small
Warn if file too large
Show preview crop
```

Recommended sizes:

```txt
Hero image: 1600x900
OG image: 1200x630
Service icon: square
Catalog image: square/product ratio
```

---

## 15. SEO Management UX

### 15.1. SEO dashboard

Show:

```txt
Pages missing SEO title
Pages missing SEO description
Posts with duplicate slug
Posts missing cover image
Posts with long meta description
Posts without source references
```

### 15.2. SEO editor panel

Fields:

```txt
SEO title
SEO description
Slug
Canonical URL
OG image
Robots index
Robots follow
```

### 15.3. SERP preview

Google-style preview:

```txt
SEO Title
https://thgfulfill.com/blog/slug
SEO Description
```

### 15.4. AI SEO actions

```txt
Generate SEO title
Generate meta description
Suggest slug
Suggest tags
Suggest internal links
```

---

## 16. Review Workflow UX

### 16.1. Pending Review Page

Views:

```txt
All
Blog
Homepage
Pricing
Services
FAQ
Policy
Agent-generated
High-risk
```

Card content:

```txt
Title
Type
Created by
Risk level
Status
Preview snippet
Age
Actions
```

### 16.2. Review Detail Page

Sections:

```txt
Content preview
Before/after diff
Source references
SEO preview
Agent notes
Reviewer comments
Audit trail
Decision panel
```

Actions:

```txt
Approve
Request Revision
Reject
Publish
Apply Change
```

### 16.3. Required reviewer comment

Required when:

```txt
Rejecting
Requesting revision
Publishing high-risk change
Applying pricing change
Applying homepage change
```

---

## 17. Audit Log UX

Every important action must be traceable.

Show:

```txt
Who did it
What changed
When it changed
Source: CMS / Telegram / Agent / API
Before value
After value
IP/user agent if available
```

Filters:

```txt
User
Role
Collection
Action
Date
Source
Risk level
```

Track:

```txt
Login
Create content
Update content
Delete/archive content
Approve
Reject
Publish
Apply change
Agent job start
Agent job fail
Telegram command
Webhook revalidate
Permission change
Token creation
```

---

## 18. Notifications

Notification types:

```txt
Review requested
Draft created by agent
Pricing approval needed
Agent job failed
Content published
Webhook failed
Source extraction failed
User permission changed
```

Channels:

```txt
In-app
Telegram
Email optional
```

Priority:

```txt
Info
Warning
Critical
```

Critical examples:

```txt
Pricing change pending publish
Homepage change applied
Policy published
Agent failed repeatedly
Webhook revalidate failed
```

---

## 19. Design System

### 19.1. Visual direction

Reference qualities:

```txt
Linear-like navigation density
Notion-like editor clarity
Vercel-like clean status cards
Stripe-like settings and table clarity
```

Do not directly copy those products.

### 19.2. Color palette

Suggested:

```txt
Background: #F8FAFC
Surface: #FFFFFF
Surface Secondary: #F1F5F9
Border: #E2E8F0
Text Primary: #0F172A
Text Secondary: #475569
Text Muted: #94A3B8
Primary: #2563EB
Primary Dark: #1D4ED8
Success: #16A34A
Warning: #F59E0B
Danger: #DC2626
Info: #0284C7
Agent Badge: #4F46E5
```

Status colors:

```txt
Draft: gray
Review: blue
Approved: green
Published: emerald
Rejected: red
High risk: orange
Critical risk: red
Agent-generated: indigo
```

### 19.3. Typography

```txt
Font: Inter or system UI
Base: 14px
Table: 13px
Page heading: 24px–30px
Section heading: 16px–18px
Line height: 1.5
```

### 19.4. Shape

```txt
Cards: 12px radius
Buttons: 8px radius
Inputs: 8px radius
Badges: 999px radius
Modals: 16px radius
```

### 19.5. Shadows

Use subtle shadows only.

```txt
Card shadow: light
Modal shadow: medium
No heavy shadows
```

---

## 20. Core Components

Required components:

```txt
AppShell
Sidebar
TopBar
Breadcrumbs
CommandPalette
DataTable
FilterBar
StatusBadge
RiskBadge
RoleBadge
AgentBadge
ContentCard
ReviewCard
DiffViewer
PreviewPanel
SEOPreview
MediaPicker
RichTextEditor
MarkdownEditor
ConfirmDialog
ActionDrawer
Timeline
AuditLogTable
Toast
NotificationCenter
```

### 20.1. DataTable features

```txt
Search
Filter
Sort
Pagination
Bulk actions
Column visibility
Row actions
Empty state
Loading skeleton
```

### 20.2. Status badges

```txt
Draft
Review
Approved
Published
Archived
Rejected
Queued
Running
Failed
Waiting Review
```

### 20.3. Diff viewer

Must support:

```txt
Field-level diff
Before/after toggle
Changed fields summary
JSON diff for admin only
```

---

## 21. Permission-Aware UX

Button visibility must depend on role.

Writer sees:

```txt
Save Draft
Request Review
Ask Agent
```

Writer does not see:

```txt
Publish
Apply Homepage Change
Manage Roles
Create Token
```

Manager sees:

```txt
Approve
Reject
Publish
Request Revision
```

Finance sees:

```txt
Approve Pricing
Reject Pricing
Request Pricing Revision
```

Admin sees:

```txt
Manage Users
Manage Tokens
Webhooks
System Logs
```

### Permission denied page

```txt
Title: You do not have permission to access this page.
Message: Contact an administrator if this access is required.
Button: Go back to dashboard
```

### Sensitive action confirmation

Modal must include:

```txt
Action name
Affected content
Risk explanation
Reviewer note field
Confirm button
Cancel button
```

Example:

```txt
Publish pricing change?

This will update public pricing information on thgfulfill.com.
A review note is required.
```

---

## 22. Agent Safety UX

Any agent-created content must show:

```txt
Generated by Agent
Human review required
Source count
Last agent job
```

Warnings:

```txt
No sources attached
Source extraction failed
Claims may need verification
Content too generic
SEO fields missing
```

Agent cannot publish.

Even if the agent suggests publish, the UI must require human confirmation.

---

## 23. Prompt Templates

Prompt template fields:

```txt
Name
Description
Task type
Default tone
Default language
System instruction
User prompt template
Required variables
Allowed tools
Approval required
```

Example:

```txt
Name: Blog Research Draft
Task type: Research blog
Language: English
Tone: Professional, direct, B2B logistics
Required variables:
- topic
- target_customer
- market
Output:
- title
- outline
- article
- SEO title
- SEO description
- FAQ suggestions
- sources
```

---

## 24. Empty States

Blog empty:

```txt
No blog posts yet.
Create your first post manually or ask the agent to draft one.

[Create Post] [Ask Agent]
```

Pending review empty:

```txt
No items waiting for review.
New drafts, pricing requests, and homepage changes will appear here.
```

Agent jobs empty:

```txt
No agent jobs yet.
Use Ask Agent to generate blog drafts, summarize sources, or suggest content changes.
```

Source inbox empty:

```txt
No sources collected.
Add a URL manually or run a research agent task.
```

---

## 25. Error States

CMS fetch failed:

```txt
Could not load content.
Try refreshing the page. If the issue persists, contact technical admin.
```

Actions:

```txt
Retry
View system status
```

Agent failed:

```txt
Task
Step where failed
Error summary
Retry button
View logs
```

Do not show raw stack traces to non-technical users.

Publish failed:

```txt
Publish failed.
The content was not published. Please retry or contact admin.
```

Also log the event.

---

## 26. Mobile UX

CMS is desktop-first, but mobile must support quick reviews.

Mobile must support:

```txt
View dashboard
Review pending items
Approve/reject
Read preview
Check agent job status
Open Telegram deep links
```

Mobile does not need full rich editing.

Mobile layout:

```txt
Single-column cards
Collapsed sidebar or bottom nav
Sticky action bar
Readable preview
Simplified diff
```

---

## 27. Page Requirements

### `/dashboard`

```txt
KPI cards
Pending review queue
Agent activity
Recent publish history
Content health
```

### `/content/landing`

```txt
Section list
Structured editor
Preview panel
Change request drawer
Publish status
```

### `/content/blog`

```txt
Blog table
Filters
Create button
Ask Agent button
Bulk archive
```

### `/content/blog/:id`

```txt
Blog editor
SEO panel
Source panel
AI assistant panel
Review controls
Revision history
```

### `/content/services`

```txt
Service cards/table
Status filter
Edit drawer/page
```

### `/content/pricing`

```txt
Pricing table
Pricing change request
Finance approval panel
Effective date
```

### `/content/faqs`

```txt
Category tabs
FAQ list
Drag reorder
AI generate FAQ
```

### `/agent/jobs`

```txt
Jobs table
Status filters
Retry/cancel
```

### `/agent/jobs/:id`

```txt
Prompt detail
Tool timeline
Sources
Created outputs
Logs
Actions
```

### `/agent/sources`

```txt
Source inbox table
Summarize
Attach to draft
Reject
```

### `/reviews`

```txt
Review queue
Risk filters
Type filters
Bulk review only for low-risk items
```

### `/settings/telegram`

```txt
Bot status
Authorized users
Command permission matrix
Recent commands
```

### `/settings/users`

```txt
Users table
Roles
Policies
Invite user
Deactivate user
```

### `/settings/audit-logs`

```txt
Audit log table
Filters
Export
Detail drawer
```

---

## 28. Mock Data Types for Claude Artifact

Use React + TypeScript mock data.

```ts
type UserRole =
  | "super_admin"
  | "developer"
  | "content_manager"
  | "writer"
  | "sales_ops"
  | "finance"
  | "seo"
  | "viewer";

type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
};
```

```ts
type ContentStatus =
  | "draft"
  | "review"
  | "approved"
  | "published"
  | "archived"
  | "rejected";

type ContentItem = {
  id: string;
  title: string;
  type: "blog" | "homepage" | "service" | "pricing" | "faq" | "policy";
  status: ContentStatus;
  createdBy: string;
  createdByType: "human" | "agent";
  risk: "low" | "medium" | "high" | "critical";
  updatedAt: string;
};
```

```ts
type AgentJobStatus =
  | "queued"
  | "running"
  | "draft_created"
  | "waiting_review"
  | "approved"
  | "failed"
  | "cancelled";

type AgentJob = {
  id: string;
  task: string;
  prompt: string;
  requestedBy: string;
  source: "cms" | "telegram" | "schedule";
  status: AgentJobStatus;
  progress: number;
  targetType: string;
  createdAt: string;
  updatedAt: string;
};
```

```ts
type ChangeRequest = {
  id: string;
  targetCollection: string;
  targetTitle: string;
  requestedBy: string;
  createdByType: "human" | "agent";
  risk: "low" | "medium" | "high" | "critical";
  status: "review" | "approved" | "applied" | "rejected";
  before: Record<string, string>;
  after: Record<string, string>;
  reason: string;
  createdAt: string;
};
```

---

## 29. Suggested Mock Data

```ts
const dashboardStats = [
  { label: "Published Posts", value: 42, trend: "+5 this month" },
  { label: "Pending Reviews", value: 7, trend: "+3 today" },
  { label: "Agent Jobs", value: 3, trend: "2 running" },
  { label: "Pricing Requests", value: 2, trend: "Finance review" },
];

const pendingReviews = [
  {
    id: "rev_001",
    title: "Homepage hero rewrite for POD sellers",
    type: "homepage",
    status: "review",
    createdBy: "Agent",
    createdByType: "agent",
    risk: "critical",
    updatedAt: "2 hours ago",
  },
  {
    id: "rev_002",
    title: "Epacket pricing note update",
    type: "pricing",
    status: "review",
    createdBy: "Sales Ops",
    createdByType: "human",
    risk: "high",
    updatedAt: "4 hours ago",
  },
  {
    id: "rev_003",
    title: "How POD Sellers Can Reduce Shipping Delays",
    type: "blog",
    status: "review",
    createdBy: "Agent",
    createdByType: "agent",
    risk: "low",
    updatedAt: "1 day ago",
  },
];
```

---

## 30. Claude Artifact Build Instruction

Use this exact instruction for Claude Artifact:

```txt
Build a polished React + TypeScript + Tailwind CMS admin interface called "THG Content OS".

The UI is for a logistics/fulfillment company managing landing page content, blog posts, pricing, FAQ, services, and AI-agent-generated drafts.

Requirements:
- Modern SaaS admin UI.
- Desktop-first responsive layout.
- Sidebar navigation.
- Top bar with search and Ask Agent button.
- Dashboard with KPI cards, pending review queue, agent activity, and recent publish history.
- Landing Page Editor with section list, structured fields, and live preview panel.
- Blog Editor with content editor, SEO panel, source references, and AI assistant panel.
- Agent Studio with agent jobs, source inbox, draft queue, and change requests.
- Review Queue with risk badges and before/after diff preview.
- Telegram Integration settings page with authorized users and command permissions.
- Role-based actions: writer cannot publish, manager can approve/publish, finance can approve pricing, admin can manage settings.
- Use mock data.
- Do not build backend.
- Do not implement raw HTML editing.
- Make it look production-grade, not a generic CRUD dashboard.
- Use clean spacing, professional typography, badges, tables, cards, drawers/modals.
```

Recommended stack for Artifact:

```txt
React
TypeScript
Tailwind CSS
lucide-react icons
shadcn/ui-style components
mock data only
```

---

## 31. Acceptance Criteria

The UI prototype is acceptable if:

```txt
1. It clearly looks like a CMS for THG, not a generic admin template.
2. Dashboard immediately shows pending work and agent activity.
3. Landing Page Editor shows layout is locked and only content is editable.
4. Blog Editor supports SEO, sources, and AI review.
5. Agent-generated content is visibly labeled.
6. High-risk changes show risk badges.
7. Publish actions are separated from draft actions.
8. Telegram integration has user-role mapping.
9. Pricing changes require finance approval.
10. Review flow is obvious.
11. UI has clean visual hierarchy and strong readability.
12. Empty/loading/error states are considered.
13. Desktop-first but usable on mobile.
```

---

## 32. Anti-patterns to Avoid

Do not design:

```txt
Plain CRUD table-only CMS
Drag-and-drop freeform page builder
Single giant settings page
UI where agent can publish directly
UI where pricing can be changed without approval
UI where all roles see all buttons
Raw JSON/HTML editor for normal staff
UI with no audit history
UI with no preview before publish
UI that mixes draft and published content unclearly
```

---

## 33. Final UX Summary

The ideal system is:

```txt
Dashboard-driven
Review-first
Agent-aware
Role-aware
Preview-heavy
Audit-friendly
Safe for non-technical staff
Strict for high-risk content
Fast for daily content work
```

Simple actions should be fast:

```txt
Create blog draft
Edit FAQ
Update video link
Request review
Approve draft
Publish blog
```

Risky actions should be controlled:

```txt
Homepage rewrite
Pricing update
Policy change
Service positioning change
Agent-generated public content
```

End state:

```txt
THG team can manage content without code.
Agents can accelerate research and drafting.
Humans stay responsible for final approval.
The public website remains stable, accurate, and professional.
```
