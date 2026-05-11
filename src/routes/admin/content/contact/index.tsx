import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Edit3, Globe, Mail, MapPin, Phone, Plus, Trash2, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { Card, PageContainer } from "@/components/cms/ui";
import { ContactLocationDialog } from "@/features/content/components/ContactLocationDialog";
import {
  deleteContactLocationFn,
  listContactLocationsFn,
  type ContactLocationRow,
} from "@/features/content/content.actions";

export const Route = createFileRoute("/admin/content/contact/")({
  head: () => ({ meta: [{ title: "Liên hệ — THG Content OS" }] }),
  loader: () => listContactLocationsFn(),
  component: ContactPage,
});

const KIND_META = {
  office: { label: "Văn phòng", icon: Building2, tone: "text-primary" },
  warehouse: { label: "Kho", icon: Warehouse, tone: "text-accent-foreground" },
  phone: { label: "Hotline", icon: Phone, tone: "text-success" },
  email: { label: "Email", icon: Mail, tone: "text-warning-foreground" },
  website: { label: "Website", icon: Globe, tone: "text-muted-foreground" },
} as const;

function ContactPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ContactLocationRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContactLocationRow | null>(null);
  const del = useServerFn(deleteContactLocationFn);

  const filtered = useMemo(
    () =>
      (data.locations as ContactLocationRow[])
        .filter((l) => l.locale === locale)
        .sort((a, b) => a.position - b.position),
    [data.locations, locale],
  );
  const distinctCount = new Set((data.locations as ContactLocationRow[]).map((l) => l.position)).size;

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Liên hệ & Văn phòng"
        subtitle={`${distinctCount} địa điểm liên hệ — mỗi địa điểm có 3 bản dịch`}
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm mục
          </button>
        }
      />
      <PageContainer>
        <Card className="overflow-hidden">
          <LocaleTabs value={locale} onChange={setLocale} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filtered.length === 0 && (
              <div className="col-span-full px-5 py-12 text-center text-muted-foreground text-sm">
                Chưa có mục nào ở ngôn ngữ này.
              </div>
            )}
            {filtered.map((c) => {
              const meta = KIND_META[c.kind];
              const Icon = meta.icon;
              return (
                <Card key={c.id} className="p-5 hover:shadow-elevated transition group">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-lg bg-surface-muted grid place-items-center ${meta.tone}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm leading-tight">{c.label}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                          {meta.label} • #{c.position}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => {
                          setEditingRow(c);
                          setDialogOpen(true);
                        }}
                        className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                        title="Sửa"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(c)}
                        className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                        title="Xóa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    {c.address && (
                      <div className={`flex items-start gap-1.5 ${c.lang_class ?? ""}`}>
                        <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <span>{c.address}</span>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[13px]">
                        <Phone className="w-3.5 h-3.5" /> {c.phone}
                      </div>
                    )}
                    {c.url && (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-[13px]">
                        <Globe className="w-3.5 h-3.5" />
                        <span className="truncate">{c.url.replace(/^mailto:/, "")}</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>
      </PageContainer>

      <ContactLocationDialog
        key={editingRow?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        locale={locale}
        row={editingRow}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa địa điểm liên hệ?"
        description={`Sẽ xóa "${confirmDelete?.label}" khỏi danh sách liên hệ. Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}
