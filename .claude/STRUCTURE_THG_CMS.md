# STRUCTURE.md — THG Fulfill Landing Page CMS Integration

## 0. Mục tiêu

Xây dựng một CMS quản trị nội dung cho landing page hiện tại của `thgfulfill.com`.

Yêu cầu quan trọng nhất:

- KHÔNG redesign landing page.
- KHÔNG đổi UI/UX hiện tại nếu không được yêu cầu.
- KHÔNG thay đổi layout, spacing, font, animation, responsive behavior.
- Chỉ tách nội dung đang hard-code trong source code sang CMS.
- Landing page hiện tại vẫn là frontend chính.
- CMS chỉ là nơi quản trị nội dung.
- Frontend fetch dữ liệu từ CMS để render vào giao diện cũ.

Mục tiêu cuối cùng:

```txt
Người quản trị vào cms.thgfulfill.com
→ sửa text / ảnh / link YouTube / service / pricing / FAQ / policy / catalog
→ bấm Save hoặc Publish
→ thgfulfill.com tự cập nhật nội dung
→ không cần sửa code mỗi lần đổi content
```

---

## 1. Kiến trúc tổng thể

```txt
[Admin User]
    ↓
cms.thgfulfill.com
    ↓
[Directus CMS]
    ↓
[PostgreSQL Database]
    ↓ REST API
thgfulfill.com
    ↓
[Existing Landing Page UI]
```

### Domain đề xuất

```txt
https://thgfulfill.com
→ public landing page khách hàng nhìn thấy

https://cms.thgfulfill.com
→ CMS admin nội bộ

https://api.thgfulfill.com
→ optional, chỉ dùng nếu muốn tách API khỏi CMS domain
```

### Stack đề xuất

```txt
CMS: Directus
Database: PostgreSQL
Frontend: giữ nguyên stack hiện tại của landing page
Media storage: Directus local upload hoặc Cloudflare R2/S3
Hosting landing page: Cloudflare Pages / Vercel / VPS hiện tại
Hosting CMS: VPS / Railway / Render / DigitalOcean
```

Nếu source landing page hiện tại là React / Vite / Next.js / Vue / static HTML thì vẫn áp dụng được. Việc cần làm là refactor source một lần để thay hard-code content bằng dữ liệu fetch từ CMS.

---

## 2. Nguyên tắc triển khai

### 2.1. Giữ nguyên phần này trong source code

Không đưa các phần sau vào CMS:

```txt
Layout
CSS
Class name
Animation
Responsive mobile
Header/footer structure
Button style
Grid layout
Section order mặc định
Component logic
Form submit logic
Tracking pixel logic
SEO rendering logic
Fallback rendering logic
```

### 2.2. Đưa các phần này vào CMS

Các nội dung nên migrate khỏi source code:

```txt
Text heading
Text paragraph
CTA button text
CTA button URL
Image URL
Banner image
YouTube link
Service name
Service description
Pricing line
FAQ
Policy content
Catalog item
SEO title
SEO description
Open Graph image
Footer company information
Social links
Contact information
```

### 2.3. Không lưu HTML tự do nếu không cần thiết

Không nên để admin nhập nguyên block HTML như:

```html
<iframe src="..."></iframe>
<section>...</section>
<script>...</script>
```

Nên lưu dữ liệu có cấu trúc:

```txt
title
description
image
button_text
button_link
youtube_url
youtube_id
is_active
sort_order
```

Lý do:

- Tránh phá layout.
- Tránh lỗi responsive.
- Tránh rủi ro XSS.
- Dễ validate dữ liệu.
- Dễ preview/publish.
- Dễ migrate về sau.

---

## 3. Collection schema trong CMS

Dùng Directus. Tạo các collections sau.

---

## 3.1. Collection: `site_settings`

Dùng cho thông tin toàn site.

### Fields

```txt
id: uuid / singleton
site_name: string
company_name: string
logo: file
favicon: file
primary_phone: string
primary_email: string
zalo_link: string
facebook_link: string
telegram_link: string
address: text
default_seo_title: string
default_seo_description: text
default_og_image: file
footer_description: text
copyright_text: string
updated_at: datetime
```

### API endpoint

```txt
GET /items/site_settings
```

### Frontend usage

```txt
Header logo
Footer company info
Default SEO
Contact buttons
Social links
```

---

## 3.2. Collection: `pages`

Quản lý metadata của từng page.

### Fields

```txt
id: uuid
slug: string unique
title: string
seo_title: string
seo_description: text
og_image: file
status: enum [draft, published, archived]
updated_at: datetime
```

### Example records

```txt
slug: home
slug: services
slug: pricing
slug: catalog
slug: policy
slug: contact
```

### API endpoint

```txt
GET /items/pages?filter[slug][_eq]=home
```

---

## 3.3. Collection: `homepage`

Có thể dùng singleton nếu homepage chỉ có một bản.

### Fields

```txt
id: uuid / singleton
hero_badge: string
hero_title: string
hero_subtitle: text
hero_description: text
hero_primary_button_text: string
hero_primary_button_link: string
hero_secondary_button_text: string
hero_secondary_button_link: string
hero_image: file
hero_video_url: string
hero_video_id: string
hero_video_title: string

stats_title: string
stats_description: text

services_section_title: string
services_section_subtitle: text

pricing_section_title: string
pricing_section_subtitle: text

faq_section_title: string
faq_section_subtitle: text

cta_title: string
cta_description: text
cta_button_text: string
cta_button_link: string

status: enum [draft, published]
updated_at: datetime
```

### API endpoint

```txt
GET /items/homepage
```

### Frontend rule

Landing page hiện tại giữ nguyên hero section, service section, pricing section, FAQ section, CTA section. Chỉ thay text/image/link từ hard-code sang data từ collection này.

---

## 3.4. Collection: `homepage_stats`

Nếu landing page có các con số như số đơn, quốc gia, thời gian xử lý, số seller.

### Fields

```txt
id: uuid
label: string
value: string
description: text
icon: string
sort_order: integer
is_active: boolean
```

### Example

```txt
value: 24h
label: Processing time

value: US
label: Main destination market
```

### API endpoint

```txt
GET /items/homepage_stats?filter[is_active][_eq]=true&sort=sort_order
```

---

## 3.5. Collection: `services`

Quản lý các dịch vụ chính.

### Fields

```txt
id: uuid
slug: string unique
name: string
short_title: string
description: text
long_description: rich_text / markdown
icon: file
image: file
button_text: string
button_link: string
target_customer: text
route_name: string
sort_order: integer
is_featured: boolean
is_active: boolean
updated_at: datetime
```

### Example records

```txt
express
fulfillment
warehouse
dropship
pod-support
china-sourcing
us-shipping
```

### API endpoint

```txt
GET /items/services?filter[is_active][_eq]=true&sort=sort_order
```

### Frontend usage

Render vào section service hiện tại. Không đổi card design. Chỉ map data:

```tsx
<ServiceCard
  title={service.name}
  description={service.description}
  icon={service.icon}
  href={service.button_link}
/>
```

---

## 3.6. Collection: `pricing_lines`

Quản lý các line vận chuyển / bảng giá / mô tả tuyến.

### Fields

```txt
id: uuid
name: string
slug: string unique
type: enum [express, standard, economy, tiktok_line, epacket, usps_priority, bulk, custom]
origin: string
destination: string
estimated_time: string
price_from: string
price_unit: string
description: text
conditions: text
note: text
badge: string
sort_order: integer
is_active: boolean
updated_at: datetime
```

### Example records

```txt
name: Epacket
origin: Vietnam / China
destination: US
estimated_time: 7-15 days
price_from: Contact for quote
price_unit: kg / order
```

### API endpoint

```txt
GET /items/pricing_lines?filter[is_active][_eq]=true&sort=sort_order
```

### Frontend usage

Nếu landing page hiện tại có bảng giá hoặc pricing card, giữ nguyên UI card/table. Chỉ thay dữ liệu.

---

## 3.7. Collection: `faqs`

Quản lý FAQ.

### Fields

```txt
id: uuid
question: string
answer: text / markdown
category: enum [general, shipping, fulfillment, pricing, warehouse, policy, catalog]
sort_order: integer
is_active: boolean
updated_at: datetime
```

### API endpoint

```txt
GET /items/faqs?filter[is_active][_eq]=true&sort=sort_order
```

### Frontend usage

Render vào accordion hiện tại.

```tsx
{faqs.map(faq => (
  <FAQItem
    question={faq.question}
    answer={faq.answer}
  />
))}
```

---

## 3.8. Collection: `youtube_videos`

Quản lý các link YouTube đang hard-code trong landing page.

### Fields

```txt
id: uuid
title: string
description: text
youtube_url: string
youtube_id: string
thumbnail: file
placement: enum [homepage_hero, homepage_video_section, service_section, faq_section, catalog_section]
sort_order: integer
is_active: boolean
updated_at: datetime
```

### Rule

Admin có thể nhập `youtube_url`.

Frontend hoặc backend phải tự parse ra `youtube_id`.

Không lưu nguyên iframe HTML trong CMS.

### YouTube URL examples

```txt
https://www.youtube.com/watch?v=abc123
https://youtu.be/abc123
https://www.youtube.com/embed/abc123
```

### Parse function

```ts
export function getYoutubeId(url: string): string {
  if (!url) return "";

  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}
```

### Safer iframe render

```tsx
<iframe
  className="video-frame"
  src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}`}
  title={video.title}
  loading="lazy"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
/>
```

---

## 3.9. Collection: `testimonials`

Nếu landing page có đánh giá khách hàng.

### Fields

```txt
id: uuid
customer_name: string
customer_role: string
company_name: string
avatar: file
quote: text
rating: integer
market: string
sort_order: integer
is_active: boolean
updated_at: datetime
```

### API endpoint

```txt
GET /items/testimonials?filter[is_active][_eq]=true&sort=sort_order
```

---

## 3.10. Collection: `policies`

Quản lý chính sách.

### Fields

```txt
id: uuid
slug: string unique
title: string
summary: text
content: markdown / rich_text
version: string
effective_date: date
status: enum [draft, published, archived]
sort_order: integer
updated_at: datetime
```

### Example records

```txt
shipping-policy
refund-policy
privacy-policy
terms-of-service
warehouse-policy
fulfillment-policy
```

### API endpoint

```txt
GET /items/policies?filter[slug][_eq]=shipping-policy&filter[status][_eq]=published
```

---

## 3.11. Collection: `catalog_categories`

Nếu landing page có catalog/sản phẩm.

### Fields

```txt
id: uuid
name: string
slug: string unique
description: text
image: file
sort_order: integer
is_active: boolean
```

---

## 3.12. Collection: `catalog_products`

Quản lý sản phẩm catalog.

### Fields

```txt
id: uuid
category: many-to-one catalog_categories
name: string
slug: string unique
short_description: text
description: markdown / rich_text
images: files
base_price: string
price_note: text
material: string
size: string
weight: string
origin: string
shipping_line: string
moq: string
status: enum [draft, published, hidden, archived]
is_featured: boolean
sort_order: integer
updated_at: datetime
```

### API endpoint

```txt
GET /items/catalog_products?filter[status][_eq]=published&sort=sort_order
```

---

## 3.13. Collection: `cta_blocks`

Dùng nếu có nhiều CTA rải trong landing page.

### Fields

```txt
id: uuid
placement: enum [hero, middle, footer, service, pricing, catalog]
title: string
description: text
button_text: string
button_link: string
secondary_button_text: string
secondary_button_link: string
image: file
is_active: boolean
sort_order: integer
```

---

## 3.14. Collection: `navigation_links`

Nếu muốn chỉnh header/footer menu qua CMS.

### Fields

```txt
id: uuid
label: string
href: string
placement: enum [header, footer, mobile]
open_new_tab: boolean
sort_order: integer
is_active: boolean
```

### API endpoint

```txt
GET /items/navigation_links?filter[is_active][_eq]=true&sort=sort_order
```

---

## 4. Mapping từ source hard-code sang CMS

Claude cần làm audit source code hiện tại.

### 4.1. Tìm toàn bộ hard-code content

Search trong source:

```txt
<h1
<h2
<h3
<p
alt=
title=
description=
youtube
iframe
FAQ
service
pricing
policy
catalog
```

### 4.2. Tạo file mapping

Tạo file:

```txt
/docs/content-mapping.md
```

Format:

```md
# Content Mapping

## Hero Section

Source file:
`src/components/Hero.tsx`

Current hard-code:
```tsx
<h1>...</h1>
<p>...</p>
```

CMS collection:
`homepage`

CMS fields:
- hero_title
- hero_description
- hero_primary_button_text
- hero_primary_button_link
- hero_image

Frontend replacement:
```tsx
<h1>{homepage.hero_title}</h1>
<p>{homepage.hero_description}</p>
```
```

### 4.3. Migration rule

Không sửa UI trong lúc mapping.

Chỉ thay:

```txt
"literal string"
```

thành:

```txt
data.field_name
```

---

## 5. API contract

Tạo một layer riêng để frontend gọi CMS. Không fetch CMS lung tung trong từng component.

### File đề xuất

```txt
src/lib/cms/client.ts
src/lib/cms/types.ts
src/lib/cms/homepage.ts
src/lib/cms/services.ts
src/lib/cms/faqs.ts
src/lib/cms/videos.ts
src/lib/cms/pricing.ts
src/lib/cms/policies.ts
src/lib/cms/catalog.ts
```

---

## 5.1. Environment variables

```env
NEXT_PUBLIC_SITE_URL=https://thgfulfill.com
CMS_URL=https://cms.thgfulfill.com
CMS_PUBLIC_TOKEN=
CMS_REVALIDATE_SECRET=
```

Rule:

```txt
Không expose admin token ra browser.
Không dùng token có quyền create/update/delete trong frontend public.
Nếu cần token, chỉ dùng read-only token ở server.
Nếu collection public read được thì không cần token cho public endpoint.
```

---

## 5.2. Directus REST client

```ts
// src/lib/cms/client.ts

const CMS_URL = process.env.CMS_URL;

if (!CMS_URL) {
  throw new Error("Missing CMS_URL environment variable");
}

type FetchOptions = {
  revalidate?: number;
  tags?: string[];
};

export async function cmsFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const url = `${CMS_URL}${path}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (process.env.CMS_PUBLIC_TOKEN) {
    headers.Authorization = `Bearer ${process.env.CMS_PUBLIC_TOKEN}`;
  }

  const res = await fetch(url, {
    headers,
    next: {
      revalidate: options.revalidate ?? 300,
      tags: options.tags,
    },
  });

  if (!res.ok) {
    throw new Error(`CMS fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
```

---

## 5.3. Directus response type

```ts
// src/lib/cms/types.ts

export type DirectusListResponse<T> = {
  data: T[];
};

export type DirectusSingleResponse<T> = {
  data: T;
};

export type DirectusFile = {
  id: string;
  filename_disk?: string;
  filename_download?: string;
  type?: string;
  title?: string;
};

export function getDirectusAssetUrl(fileId?: string | null): string {
  if (!fileId) return "";
  return `${process.env.CMS_URL}/assets/${fileId}`;
}
```

---

## 6. Fetch functions

---

## 6.1. Homepage

```ts
// src/lib/cms/homepage.ts

import { cmsFetch } from "./client";
import type { DirectusSingleResponse } from "./types";

export type Homepage = {
  hero_badge?: string;
  hero_title: string;
  hero_subtitle?: string;
  hero_description?: string;
  hero_primary_button_text?: string;
  hero_primary_button_link?: string;
  hero_secondary_button_text?: string;
  hero_secondary_button_link?: string;
  hero_image?: string;
  hero_video_url?: string;
  hero_video_id?: string;
  hero_video_title?: string;

  stats_title?: string;
  stats_description?: string;

  services_section_title?: string;
  services_section_subtitle?: string;

  pricing_section_title?: string;
  pricing_section_subtitle?: string;

  faq_section_title?: string;
  faq_section_subtitle?: string;

  cta_title?: string;
  cta_description?: string;
  cta_button_text?: string;
  cta_button_link?: string;
};

export async function getHomepage(): Promise<Homepage | null> {
  try {
    const res = await cmsFetch<DirectusSingleResponse<Homepage>>(
      "/items/homepage?fields=*.*",
      {
        revalidate: 300,
        tags: ["homepage"],
      }
    );

    return res.data;
  } catch (error) {
    console.error("[CMS] getHomepage failed", error);
    return null;
  }
}
```

---

## 6.2. Services

```ts
// src/lib/cms/services.ts

import { cmsFetch } from "./client";
import type { DirectusListResponse } from "./types";

export type Service = {
  id: string;
  slug: string;
  name: string;
  short_title?: string;
  description?: string;
  long_description?: string;
  icon?: string;
  image?: string;
  button_text?: string;
  button_link?: string;
  target_customer?: string;
  route_name?: string;
  sort_order?: number;
};

export async function getServices(): Promise<Service[]> {
  try {
    const res = await cmsFetch<DirectusListResponse<Service>>(
      "/items/services?filter[is_active][_eq]=true&sort=sort_order&fields=*.*",
      {
        revalidate: 300,
        tags: ["services"],
      }
    );

    return res.data ?? [];
  } catch (error) {
    console.error("[CMS] getServices failed", error);
    return [];
  }
}
```

---

## 6.3. Pricing lines

```ts
// src/lib/cms/pricing.ts

import { cmsFetch } from "./client";
import type { DirectusListResponse } from "./types";

export type PricingLine = {
  id: string;
  name: string;
  slug: string;
  type?: string;
  origin?: string;
  destination?: string;
  estimated_time?: string;
  price_from?: string;
  price_unit?: string;
  description?: string;
  conditions?: string;
  note?: string;
  badge?: string;
  sort_order?: number;
};

export async function getPricingLines(): Promise<PricingLine[]> {
  try {
    const res = await cmsFetch<DirectusListResponse<PricingLine>>(
      "/items/pricing_lines?filter[is_active][_eq]=true&sort=sort_order",
      {
        revalidate: 300,
        tags: ["pricing"],
      }
    );

    return res.data ?? [];
  } catch (error) {
    console.error("[CMS] getPricingLines failed", error);
    return [];
  }
}
```

---

## 6.4. FAQ

```ts
// src/lib/cms/faqs.ts

import { cmsFetch } from "./client";
import type { DirectusListResponse } from "./types";

export type FAQ = {
  id: string;
  question: string;
  answer: string;
  category?: string;
  sort_order?: number;
};

export async function getFAQs(): Promise<FAQ[]> {
  try {
    const res = await cmsFetch<DirectusListResponse<FAQ>>(
      "/items/faqs?filter[is_active][_eq]=true&sort=sort_order",
      {
        revalidate: 300,
        tags: ["faqs"],
      }
    );

    return res.data ?? [];
  } catch (error) {
    console.error("[CMS] getFAQs failed", error);
    return [];
  }
}
```

---

## 6.5. YouTube videos

```ts
// src/lib/cms/videos.ts

import { cmsFetch } from "./client";
import type { DirectusListResponse } from "./types";

export type YoutubeVideo = {
  id: string;
  title: string;
  description?: string;
  youtube_url?: string;
  youtube_id?: string;
  thumbnail?: string;
  placement?: string;
  sort_order?: number;
};

export function getYoutubeId(url: string): string {
  if (!url) return "";

  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

export async function getYoutubeVideos(
  placement?: string
): Promise<YoutubeVideo[]> {
  try {
    const filter = placement
      ? `&filter[placement][_eq]=${encodeURIComponent(placement)}`
      : "";

    const res = await cmsFetch<DirectusListResponse<YoutubeVideo>>(
      `/items/youtube_videos?filter[is_active][_eq]=true${filter}&sort=sort_order`,
      {
        revalidate: 300,
        tags: ["videos"],
      }
    );

    return res.data ?? [];
  } catch (error) {
    console.error("[CMS] getYoutubeVideos failed", error);
    return [];
  }
}
```

---

## 7. Frontend integration rule

### 7.1. Page-level fetch

Nếu dùng Next.js App Router:

```tsx
// src/app/page.tsx

import { getHomepage } from "@/lib/cms/homepage";
import { getServices } from "@/lib/cms/services";
import { getPricingLines } from "@/lib/cms/pricing";
import { getFAQs } from "@/lib/cms/faqs";
import { getYoutubeVideos } from "@/lib/cms/videos";

export default async function HomePage() {
  const [
    homepage,
    services,
    pricingLines,
    faqs,
    videos,
  ] = await Promise.all([
    getHomepage(),
    getServices(),
    getPricingLines(),
    getFAQs(),
    getYoutubeVideos("homepage_video_section"),
  ]);

  return (
    <>
      <Hero data={homepage} />
      <ServicesSection
        title={homepage?.services_section_title}
        subtitle={homepage?.services_section_subtitle}
        services={services}
      />
      <PricingSection
        title={homepage?.pricing_section_title}
        subtitle={homepage?.pricing_section_subtitle}
        pricingLines={pricingLines}
      />
      <VideoSection videos={videos} />
      <FAQSection
        title={homepage?.faq_section_title}
        subtitle={homepage?.faq_section_subtitle}
        faqs={faqs}
      />
      <CTASection data={homepage} />
    </>
  );
}
```

### 7.2. Component rule

Component không tự gọi API nếu không cần. Component chỉ nhận props.

Sai:

```tsx
function Hero() {
  const data = fetch(...)
}
```

Đúng:

```tsx
function Hero({ data }) {
  return (
    <section className="existing-hero-class">
      <h1>{data?.hero_title || FALLBACK_HOMEPAGE.hero_title}</h1>
      <p>{data?.hero_description || FALLBACK_HOMEPAGE.hero_description}</p>
    </section>
  );
}
```

---

## 8. Fallback content

Không được để website blank nếu CMS lỗi.

Tạo fallback content từ nội dung hiện tại.

### File

```txt
src/lib/cms/fallback.ts
```

### Example

```ts
export const FALLBACK_HOMEPAGE = {
  hero_title: "Shipping & Fulfillment for Global Sellers",
  hero_description:
    "We help sellers ship from Vietnam and China to worldwide markets.",
  hero_primary_button_text: "Contact us",
  hero_primary_button_link: "/contact",
};

export const FALLBACK_SERVICES = [
  {
    slug: "express",
    name: "Express Shipping",
    description: "Fast international shipping support for ecommerce sellers.",
  },
  {
    slug: "fulfillment",
    name: "Fulfillment",
    description: "Storage, packing, and order processing support.",
  },
];
```

Rule:

```txt
Fallback chỉ dùng khi CMS lỗi.
Nguồn nội dung chính vẫn là CMS.
Không dùng fallback để tiếp tục hard-code mọi thứ như cũ.
```

---

## 9. Cache và revalidate

### 9.1. Default cache

Dùng cache/revalidate để tránh mỗi request public đều đánh vào CMS.

Gợi ý:

```txt
Homepage: 300 seconds
Services: 300–900 seconds
FAQ: 300–900 seconds
Pricing: 60–300 seconds
Policy: 900–3600 seconds
Catalog: 300–900 seconds
```

### 9.2. Webhook revalidate

Tạo API route để Directus gọi khi admin publish.

```txt
POST /api/revalidate
```

### Example

```ts
// src/app/api/revalidate/route.ts

import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CMS_REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const tags = body?.tags || [];

  if (!Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json({ message: "No tags provided" }, { status: 400 });
  }

  for (const tag of tags) {
    revalidateTag(tag);
  }

  return NextResponse.json({
    revalidated: true,
    tags,
  });
}
```

### Directus webhook payload examples

Khi update homepage:

```json
{
  "tags": ["homepage"]
}
```

Khi update services:

```json
{
  "tags": ["services"]
}
```

Khi update pricing:

```json
{
  "tags": ["pricing"]
}
```

---

## 10. CMS permissions

Tạo các roles:

### 10.1. Role: `Administrator`

Quyền:

```txt
Full access
Create/update/delete collections
Manage users
Manage settings
Publish content
```

### 10.2. Role: `Editor`

Quyền:

```txt
Read/create/update content
Cannot change schema
Cannot manage users
Cannot delete critical records unless explicitly allowed
Can set status draft/published if allowed
```

### 10.3. Role: `Viewer`

Quyền:

```txt
Read only
No create/update/delete
```

### 10.4. Public role

Chỉ cho public read với content published/active.

Public role được đọc:

```txt
site_settings
homepage
services where is_active = true
pricing_lines where is_active = true
faqs where is_active = true
youtube_videos where is_active = true
policies where status = published
catalog_products where status = published
catalog_categories where is_active = true
navigation_links where is_active = true
```

Public role không được:

```txt
create
update
delete
read draft content
read private admin fields
read user information
read tokens
```

---

## 11. Publish workflow

Nên có field:

```txt
status: draft / published / archived
is_active: boolean
updated_at: datetime
```

Rule:

```txt
Draft content không hiển thị public.
Published content mới hiển thị public.
Archived content không hiển thị.
is_active=false thì không render.
```

Frontend filter:

```txt
filter[status][_eq]=published
filter[is_active][_eq]=true
```

---

## 12. SEO integration

### 12.1. Page metadata from CMS

Fetch `pages` collection theo slug.

```ts
export async function generateMetadata() {
  const page = await getPageBySlug("home");

  return {
    title: page?.seo_title || FALLBACK_SEO.title,
    description: page?.seo_description || FALLBACK_SEO.description,
    openGraph: {
      title: page?.seo_title,
      description: page?.seo_description,
      images: page?.og_image ? [getDirectusAssetUrl(page.og_image)] : [],
    },
  };
}
```

### 12.2. Required SEO fields

```txt
seo_title
seo_description
og_image
canonical_url
robots_index
robots_follow
```

---

## 13. Media handling

### 13.1. Images

Use Directus file upload.

Frontend asset URL:

```ts
function getAssetUrl(fileId?: string | null) {
  if (!fileId) return "";
  return `${process.env.CMS_URL}/assets/${fileId}`;
}
```

### 13.2. Image rules

CMS nên validate:

```txt
Hero image: landscape
Service icon: square
Catalog image: square / product ratio
OG image: 1200x630
File type: jpg/png/webp/svg if trusted
Max size: tùy hosting
```

### 13.3. Alt text

Nên tạo thêm field:

```txt
image_alt: string
```

Cho các content quan trọng.

---

## 14. YouTube handling

### 14.1. CMS stores

```txt
youtube_url
youtube_id
title
description
thumbnail
placement
```

### 14.2. Frontend renders

```tsx
function YoutubeEmbed({ video }) {
  const id = video.youtube_id || getYoutubeId(video.youtube_url || "");

  if (!id) return null;

  return (
    <div className="existing-video-wrapper-class">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={video.title || "THG Fulfill video"}
        loading="lazy"
        allowFullScreen
      />
    </div>
  );
}
```

### 14.3. Do not store

```txt
Do not store iframe HTML.
Do not allow script tags.
Do not allow arbitrary embed HTML.
```

---

## 15. Error handling

Frontend phải có graceful fallback.

### Rule

Nếu CMS lỗi:

```txt
Không crash page.
Không blank section.
Log server-side error.
Render fallback content nếu có.
Ẩn section nếu không có dữ liệu và không có fallback.
```

### Example

```tsx
if (!services.length) {
  return null;
}
```

Hoặc:

```tsx
const displayServices = services.length ? services : FALLBACK_SERVICES;
```

---

## 16. Development task list for Claude

Claude cần làm theo thứ tự này.

### Phase 1 — Audit existing landing page

```txt
1. Inspect source tree.
2. Identify framework: Next.js / Vite / React / Vue / static HTML.
3. Locate homepage entry file.
4. Locate components:
   - Hero
   - Header
   - Footer
   - Services
   - Pricing
   - FAQ
   - Video
   - Catalog
   - Policy
   - CTA
5. List all hard-code content.
6. Create /docs/content-mapping.md.
```

Output required:

```txt
/docs/content-mapping.md
```

---

### Phase 2 — Setup CMS schema

```txt
1. Install Directus or connect to existing Directus instance.
2. Create PostgreSQL database.
3. Create collections:
   - site_settings
   - pages
   - homepage
   - homepage_stats
   - services
   - pricing_lines
   - faqs
   - youtube_videos
   - testimonials
   - policies
   - catalog_categories
   - catalog_products
   - cta_blocks
   - navigation_links
4. Configure public read permissions.
5. Configure admin/editor roles.
6. Add sample content copied from current landing page.
```

Output required:

```txt
CMS running at cms.thgfulfill.com or local CMS URL
Collections created
Sample content inserted
Public read API tested
```

---

### Phase 3 — Add CMS fetch layer

Create:

```txt
src/lib/cms/client.ts
src/lib/cms/types.ts
src/lib/cms/homepage.ts
src/lib/cms/services.ts
src/lib/cms/pricing.ts
src/lib/cms/faqs.ts
src/lib/cms/videos.ts
src/lib/cms/policies.ts
src/lib/cms/catalog.ts
src/lib/cms/fallback.ts
```

Rule:

```txt
All CMS calls go through src/lib/cms.
No random fetch inside UI components.
No admin token in client bundle.
```

---

### Phase 4 — Refactor frontend components

For each component:

```txt
Keep existing JSX/HTML structure.
Keep existing classes.
Keep existing CSS.
Replace hard-coded text/images/links with props from CMS.
Use fallback where needed.
```

Example:

Before:

```tsx
<h2>Our Services</h2>
```

After:

```tsx
<h2>{title || "Our Services"}</h2>
```

Before:

```tsx
<iframe src="https://www.youtube.com/embed/abc123" />
```

After:

```tsx
<YoutubeEmbed video={video} />
```

---

### Phase 5 — Revalidate / cache

```txt
1. Add revalidate seconds to fetch calls.
2. Add tag-based revalidation if using Next.js.
3. Create /api/revalidate endpoint.
4. Configure Directus webhook after item update/publish.
5. Test update from CMS.
```

---

### Phase 6 — Testing

Test cases:

```txt
1. Landing page loads when CMS online.
2. Landing page loads when CMS offline.
3. Hero title can be changed from CMS.
4. Hero image can be changed from CMS.
5. YouTube video can be changed from CMS.
6. Service card can be added/disabled from CMS.
7. FAQ can be reordered.
8. Pricing line can be updated.
9. Draft content does not appear publicly.
10. Public API cannot edit data.
11. Admin token is not exposed in browser.
12. Mobile responsive layout unchanged.
13. SEO metadata renders correctly.
14. Build/deploy passes.
```

---

## 17. Acceptance criteria

Dự án đạt yêu cầu khi:

```txt
1. thgfulfill.com giữ nguyên giao diện cũ.
2. Admin có thể sửa content trong CMS.
3. Nội dung homepage lấy từ CMS.
4. Services lấy từ CMS.
5. Pricing lấy từ CMS.
6. FAQ lấy từ CMS.
7. YouTube links lấy từ CMS.
8. Policy/catalog nếu có thì lấy từ CMS.
9. Source code không còn hard-code content chính.
10. Có fallback khi CMS lỗi.
11. Có cache/revalidate.
12. Public API chỉ đọc published/active content.
13. Không expose admin token.
14. Deploy production chạy ổn định.
```

---

## 18. Claude instruction

Khi Claude implement, bắt buộc tuân thủ:

```txt
Do not redesign the landing page.
Do not change existing UI unless necessary for data binding.
Do not remove existing styles.
Do not modify unrelated business logic.
Do not expose CMS admin token to client-side code.
Do not store arbitrary iframe/script HTML in CMS.
Do not break mobile layout.
Do not fetch CMS data inside every small component.
Do not skip fallback handling.
```

Claude nên thực hiện theo hướng:

```txt
1. Audit source
2. Create mapping
3. Create CMS schema
4. Add fetch layer
5. Refactor components
6. Add fallback
7. Add cache/revalidate
8. Test
```

---

## 19. Suggested folder structure

```txt
src/
  app/
    page.tsx
    api/
      revalidate/
        route.ts
  components/
    layout/
      Header.tsx
      Footer.tsx
    sections/
      Hero.tsx
      ServicesSection.tsx
      PricingSection.tsx
      VideoSection.tsx
      FAQSection.tsx
      CTASection.tsx
      CatalogSection.tsx
    ui/
      YoutubeEmbed.tsx
      ServiceCard.tsx
      FAQItem.tsx
  lib/
    cms/
      client.ts
      types.ts
      homepage.ts
      services.ts
      pricing.ts
      faqs.ts
      videos.ts
      policies.ts
      catalog.ts
      settings.ts
      fallback.ts
      assets.ts
  docs/
    content-mapping.md
    cms-schema.md
```

---

## 20. Optional: CMS schema documentation file

Create:

```txt
/docs/cms-schema.md
```

Include:

```txt
Collection name
Purpose
Fields
Public read permission
Frontend usage
Example API endpoint
```

---

## 21. Optional: seed content

Create a seed script if needed:

```txt
scripts/seed-cms-content.ts
```

Purpose:

```txt
Copy current hard-code landing page content into CMS automatically.
```

If seed script is too much, manually enter content in Directus admin.

---

## 22. Final implementation summary

Expected final state:

```txt
Before:
Landing page source code contains all content directly.

After:
Landing page source code contains UI and render logic only.
CMS contains editable content.
Frontend fetches CMS data.
Admin edits CMS instead of editing source code.
```
