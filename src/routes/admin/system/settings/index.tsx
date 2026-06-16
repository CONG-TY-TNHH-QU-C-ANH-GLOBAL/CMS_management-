import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import {
  getSiteSettingsFn,
  updateOgImageFn,
  updateSiteSettingsFn,
  type SiteSettingsRow,
} from "@/features/settings/settings.actions";

export const Route = createFileRoute("/admin/system/settings/")({
  head: () => ({ meta: [{ title: "Cài đặt site — THG Content OS" }] }),
  loader: () => getSiteSettingsFn(),
  component: SettingsPage,
});

interface FormState {
  brand_name: string;
  ga4_id: string;
  gtm_id: string;
  fb_pixel_id: string;
  tiktok_pixel_id: string;
  contact_phone: string;
  contact_email: string;
  facebook_url: string;
  lead_form_destination: string;
  about_video_url: string;
  og_image_url: string;
}

function fromRow(row: SiteSettingsRow | null): FormState {
  return {
    brand_name: row?.brand_name ?? "",
    ga4_id: row?.ga4_id ?? "",
    gtm_id: row?.gtm_id ?? "",
    fb_pixel_id: row?.fb_pixel_id ?? "",
    tiktok_pixel_id: row?.tiktok_pixel_id ?? "",
    contact_phone: row?.contact_phone ?? "",
    contact_email: row?.contact_email ?? "",
    facebook_url: row?.facebook_url ?? "",
    lead_form_destination: row?.lead_form_destination ?? "",
    about_video_url: row?.about_video_url ?? "",
    og_image_url: row?.og_image_url ?? "",
  };
}

function SettingsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const update = useServerFn(updateSiteSettingsFn);
  const updateOgImage = useServerFn(updateOgImageFn);
  const initial = useMemo(() => fromRow(data.settings as SiteSettingsRow | null), [data.settings]);
  const [form, setForm] = useState<FormState>(initial);
  const [pending, setPending] = useState(false);
  const [ogPending, setOgPending] = useState(false);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSaveOgImage() {
    setOgPending(true);
    try {
      await updateOgImage({ data: { og_image_url: form.og_image_url === "" ? null : form.og_image_url } });
      toast.success("Đã lưu thumbnail — redeploy landing page để áp dụng");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setOgPending(false);
    }
  }

  async function handleSave() {
    setPending(true);
    try {
      // Convert empty strings to null for nullable cols
      const payload: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) payload[k] = v === "" ? null : v;
      // brand_name shouldn't be null (server schema requires non-empty string)
      if (payload.brand_name === null) payload.brand_name = "THG Fulfill";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await update({ data: payload as any });
      toast.success("Đã lưu cài đặt website");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <CmsTopbar title="Cài đặt website" subtitle="Thông tin thương hiệu, mã tracking, liên hệ, social — hiển thị trên toàn bộ website" />
      <PageContainer>
        <div className="grid lg:grid-cols-2 gap-4 pb-24">
          <Card>
            <CardHeader title="Thương hiệu" />
            <div className="p-5 space-y-3">
              <Field label="Tên thương hiệu" value={form.brand_name} onChange={(v) => set("brand_name", v)} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Thông tin liên hệ" hint="Hiển thị ở footer + khu vực Liên hệ trên trang chủ" />
            <div className="p-5 space-y-3">
              <Field label="Hotline" value={form.contact_phone} onChange={(v) => set("contact_phone", v)} placeholder="0335.124.089" />
              <Field label="Email" value={form.contact_email} onChange={(v) => set("contact_email", v)} placeholder="info@thgfulfill.com" type="email" />
              <Field label="Facebook URL" value={form.facebook_url} onChange={(v) => set("facebook_url", v)} placeholder="https://facebook.com/THGFulfill" type="url" />
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Đo lường truy cập (Analytics)" hint="Các mã này sẽ được nhúng vào website sau khi khách đồng ý nhận cookie" />
            <div className="p-5 grid sm:grid-cols-2 gap-3">
              <Field label="Google Analytics 4 (G-XXX)" value={form.ga4_id} onChange={(v) => set("ga4_id", v)} placeholder="G-XXXXXXXXXX" mono />
              <Field label="Google Tag Manager (GTM-XXX)" value={form.gtm_id} onChange={(v) => set("gtm_id", v)} placeholder="GTM-XXXXXXX" mono />
              <Field label="Meta Pixel ID" value={form.fb_pixel_id} onChange={(v) => set("fb_pixel_id", v)} placeholder="123456789012345" mono />
              <Field label="TikTok Pixel ID" value={form.tiktok_pixel_id} onChange={(v) => set("tiktok_pixel_id", v)} placeholder="C0XXXXXXXXXXX" mono />
            </div>
            <div className="px-5 pb-5 text-xs text-muted-foreground">
              Website chỉ kích hoạt tracking sau khi khách bấm "Đồng ý" trên banner cookie. Bỏ trống để tắt hoàn toàn loại tracking đó.
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Video giới thiệu trang chủ" hint="Video YouTube hiển thị ở khu vực “Tìm hiểu THG qua video” trên trang chủ" />
            <div className="p-5 space-y-3">
              <Field
                label="Đường dẫn YouTube"
                value={form.about_video_url}
                onChange={(v) => set("about_video_url", v)}
                placeholder="https://www.youtube.com/watch?v=Cvj8kqFMLfk"
                type="url"
              />
              <div className="text-xs text-muted-foreground">
                Dán link xem video YouTube vào đây. Hệ thống sẽ tự lấy mã video để nhúng vào trang chủ. Bỏ trống để ẩn video khỏi trang chủ.
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Ảnh thumbnail mặc định (Facebook / Zalo)" hint="Ảnh hiện ra khi chia sẻ link thgfulfill.com trên mạng xã hội" />
            <div className="p-5 space-y-3">
              <Field
                label="URL ảnh thumbnail"
                value={form.og_image_url}
                onChange={(v) => set("og_image_url", v)}
                placeholder="https://thgfulfill.com/thg-brand-icon.png"
                type="url"
              />
              <div className="text-xs text-muted-foreground">
                Dán URL ảnh vào đây (khuyến nghị tối thiểu 256×256px). Sau khi lưu, cần <strong>redeploy landing page</strong> để áp dụng (CI/CD sẽ tự inject vào index.html khi deploy).
              </div>
              {form.og_image_url && (
                <div className="rounded-lg border border-border overflow-hidden inline-block">
                  <img src={form.og_image_url} alt="OG preview" className="h-20 w-20 object-cover" referrerPolicy="no-referrer" />
                </div>
              )}
              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSaveOgImage}
                  disabled={ogPending}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-soft"
                >
                  <Save className="w-4 h-4" /> {ogPending ? "Đang lưu…" : "Lưu thumbnail"}
                </button>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Form nhận thông tin khách hàng" hint="Khi khách bấm 'Tư vấn ngay' trên website, dữ liệu được lưu vào CMS" />
            <div className="p-5 space-y-3">
              <Field
                label="Đường dẫn nhận thông báo (tùy chọn)"
                value={form.lead_form_destination}
                onChange={(v) => set("lead_form_destination", v)}
                placeholder="Webhook Slack, Telegram, Zapier..."
                type="url"
              />
              <div className="text-xs text-muted-foreground">
                Mọi lead đều được lưu vào CMS. Nếu nhập webhook ở đây, hệ thống sẽ gửi thông báo realtime mỗi khi có khách mới đăng ký.
              </div>
            </div>
          </Card>
        </div>

        {isDirty && (
          <div className="fixed bottom-0 right-0 lg:left-65 lg:right-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl p-3 shadow-elevated">
            <div className="max-w-7xl mx-auto flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Có thay đổi chưa lưu
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setForm(initial)}
                disabled={pending}
                className="h-9 px-3 rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
              >
                Hủy thay đổi
              </button>
              <button
                onClick={handleSave}
                disabled={pending}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-soft"
              >
                <Save className="w-4 h-4" /> {pending ? "Đang lưu…" : "Lưu cài đặt"}
              </button>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring ${mono ? "font-mono text-xs" : ""}`}
      />
    </div>
  );
}
