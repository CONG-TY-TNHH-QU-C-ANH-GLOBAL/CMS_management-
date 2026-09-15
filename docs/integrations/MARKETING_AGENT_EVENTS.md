# Marketing agent → CMS Event drafts

The marketing tool (`marketing.thgfulfill.com`) writes Events into the CMS by
posting to one endpoint. A submitted Event lands as a **draft**; the marketing
team reviews it in the CMS Event editor and publishes it there. Publishing is
never something the agent does.

`POST https://cms.thgfulfill.com/api/v1/agent/events`

## Authentication

`Authorization: Bearer <MARKETING_AGENT_TOKEN>`

- Set the same high-entropy value as `MARKETING_AGENT_TOKEN` in the CMS Worker's
  secret store and in the marketing tool's server config.
  `bunx wrangler secret put MARKETING_AGENT_TOKEN`.
- Server-to-server only. The route sends no CORS headers, so a browser cannot
  call it — the token must stay on the marketing tool's backend and never reach
  its client bundle.
- With no secret configured the route answers `503` for every request. It fails
  closed, so a half-configured deployment refuses traffic rather than accepting
  it.

## Request

```json
{
  "slug": "thg-x-onpoint",
  "locale": "vi",
  "title": "THG x ONPOINT",
  "event_date": "2026-09-01",
  "summary": "Câu chuyện hợp tác và vận hành cùng ONPOINT.",
  "body_md": "## THG x ONPOINT\n\nXem lại nội dung sự kiện…",
  "end_date": null,
  "location": "TP. Hồ Chí Minh",
  "role": "Sự kiện đối tác",
  "url": "https://www.facebook.com/share/p/1Spw5uMYPT/",
  "video_url": "https://youtu.be/q7NiFssAaRE",
  "cover_url": "https://cdn.example.com/thg-onpoint.jpg",
  "seo_title": "THG x ONPOINT | THG Fulfill",
  "seo_description": "Sự kiện hợp tác giữa THG Fulfill và ONPOINT.",
  "agent": "marketing-writer-v1"
}
```

Required: `slug`, `title`, `event_date`. Everything else is optional.

- `slug` — lowercase letters, digits and single dashes. It is the public URL:
  `thgfulfill.com/<locale>/events/<slug>`.
- `locale` — `vi` (default), `en` or `zh`. One row per locale; the same slug in
  two locales is the same Event in two languages, not two Events.
- `event_date` / `end_date` — `YYYY-MM-DD`, nothing else. The column is TEXT and
  the site sorts these as strings. Set `end_date` only for a multi-day event.
- `body_md` — Markdown. The landing renders it with GFM.
- `cover_url` — an absolute image URL the agent already hosts. CMS records the
  URL rather than downloading it; an operator can replace it with an uploaded
  asset before publishing. Omit it and an Event with a YouTube `video_url` falls
  back to that video's thumbnail.
- `agent` — free text, recorded in the audit log so a reviewer can see which job
  proposed the draft.

There is **no `status` field**. Sending one has no effect: it is dropped while
parsing, and the stored status is hardcoded to `draft`.

## Response

`201` on first submission, `200` when an existing draft is updated:

```json
{
  "ok": true,
  "outcome": "created",
  "id": 12,
  "slug": "thg-x-onpoint",
  "locale": "vi",
  "status": "draft",
  "review_url": "https://cms.thgfulfill.com/admin/content/events/thg-x-onpoint"
}
```

Errors return `{ "error": "…" }`; a `400` also carries an `issues` array naming
the offending fields.

| Status | Meaning                                                                |
| ------ | ---------------------------------------------------------------------- |
| `400`  | Body is not JSON, or fails validation — see `issues`.                  |
| `401`  | Missing or wrong bearer token.                                         |
| `409`  | That `(slug, locale)` is already **published**. See below.             |
| `503`  | `MARKETING_AGENT_TOKEN` is not configured on the server.               |
| `500`  | Write failed. Safe to retry.                                           |

## Re-running a job

Posting the same `(slug, locale)` again overwrites the existing **draft** — so
an agent that reruns is idempotent and does not pile up duplicates.

Once marketing has published that Event, the same call returns `409` and changes
nothing. This is deliberate: an agent must not be able to silently rewrite what
is live on `thgfulfill.com`. To revise a published Event, either an operator
moves it back to draft in the CMS, or the agent submits under a new slug.

## Where a draft shows up

CMS → **Nội dung → Event**. The list marks each locale `VI / EN / ZH` and greys
the ones still in draft. Open the Event, review and edit the content, then set
**Trạng thái → Xuất bản** and save. Only then does it appear on
`thgfulfill.com/<locale>/events`.
