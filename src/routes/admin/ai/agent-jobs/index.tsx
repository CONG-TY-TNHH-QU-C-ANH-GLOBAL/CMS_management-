import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Edit3, Info, Loader2, Pause, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import {
  createBotCampaignFn,
  deleteBotCampaignFn,
  listBotCampaignsFn,
  runBotCampaignNowFn,
  updateBotCampaignFn,
  type BlogBotCampaignRow,
  type BlogBotRunRow,
} from "@/features/blog-bot/blog-bot.actions";

interface LoaderData {
  campaigns: BlogBotCampaignRow[];
  runs: BlogBotRunRow[];
}

export const Route = createFileRoute("/admin/ai/agent-jobs/")({
  head: () => ({ meta: [{ title: "Blog Auto-Bot — THG Content OS" }] }),
  loader: async (): Promise<LoaderData> => {
    const { campaigns, runs } = await listBotCampaignsFn();
    return { campaigns, runs };
  },
  component: AgentJobsPage,
});

const RUN_STATUS_STYLE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  generating: "bg-sky-100 text-sky-800 border-sky-300",
  imaging: "bg-sky-100 text-sky-800 border-sky-300",
  verifying: "bg-amber-100 text-amber-800 border-amber-300",
  needs_review: "bg-amber-100 text-amber-800 border-amber-300",
  published: "bg-emerald-100 text-emerald-800 border-emerald-300",
  failed: "bg-red-100 text-red-800 border-red-300",
  skipped: "bg-muted text-muted-foreground border-border",
};

function RunStatusPill({ status }: { status: string }) {
  const cls = RUN_STATUS_STYLE[status] ?? RUN_STATUS_STYLE.pending;
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}
    >
      {status}
    </span>
  );
}

interface ParsedVerdict {
  passed?: boolean;
  moderation?: { flagged?: boolean; categories?: string[] };
  judge?: {
    safe?: boolean;
    score?: number;
    summary?: string;
    issues?: { severity: string; message: string }[];
  };
  error?: string | null;
}

// Content-verifier badge: green when the article passed moderation + judge,
// red otherwise. Hover shows the judge summary + issues.
function VerdictBadge({ json }: { json: string | null }) {
  if (!json) return <span className="text-xs text-muted-foreground">—</span>;
  let v: ParsedVerdict;
  try {
    v = JSON.parse(json) as ParsedVerdict;
  } catch {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const score = v.judge?.score;
  const issues = v.judge?.issues ?? [];
  const tip = [
    v.judge?.summary,
    v.moderation?.flagged ? `⚠ Moderation: ${(v.moderation.categories ?? []).join(", ")}` : "",
    ...issues.map((i) => `[${i.severity}] ${i.message}`),
    v.error ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const cls = v.passed
    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : "bg-red-100 text-red-800 border-red-300";
  const label = `${v.passed ? "An toàn" : "Cần soát"}${score !== undefined ? ` ${score}` : ""}`;
  return (
    <span
      title={tip || undefined}
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border cursor-help ${cls}`}
    >
      {label}
    </span>
  );
}

function AgentJobsPage() {
  const data = Route.useLoaderData() as LoaderData;
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BlogBotCampaignRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogBotCampaignRow | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  const create = useServerFn(createBotCampaignFn);
  const update = useServerFn(updateBotCampaignFn);
  const remove = useServerFn(deleteBotCampaignFn);
  const runNow = useServerFn(runBotCampaignNowFn);

  async function handleRunNow(c: BlogBotCampaignRow) {
    setRunningId(c.id);
    try {
      const { run } = await runNow({ data: { id: c.id } });
      if (run.status === "published") {
        toast.success(`Đã tự động ĐĂNG bài "${run.blog_slug}" (verifier đạt).`);
        if (run.error) toast.warning(run.error);
      } else if (run.status === "needs_review") {
        toast.success(`Đã tạo bản nháp "${run.blog_slug}" — vào Bài viết để duyệt & đăng.`);
        if (run.error) toast.warning(`Lưu ý: ${run.error}`);
      } else if (run.status === "skipped") {
        toast.warning(run.error ?? "Đã bỏ qua lần chạy này.");
      } else {
        toast.error(run.error ?? "Sinh bài thất bại.");
      }
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chạy bot thất bại");
    } finally {
      setRunningId(null);
    }
  }

  async function handleToggleEnabled(c: BlogBotCampaignRow) {
    try {
      await update({ data: { id: c.id, enabled: c.enabled === 0 } });
      toast.success(c.enabled ? "Đã tạm dừng bot" : "Đã bật bot");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật thất bại");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await remove({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa bot");
      setConfirmDelete(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <>
      <CmsTopbar title="Blog Auto-Bot" subtitle="Bot tự động soạn & đăng bài blog theo lịch/lệnh" />
      <PageContainer>
        {/* Phase-1 banner: manual generation live; scheduler + verifier later. */}
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm">
          <Info className="w-5 h-5 text-sky-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-sky-900">Blog Auto-Bot — đầy đủ</div>
            <div className="text-sky-900/80 mt-0.5">
              Bot <strong>tự chạy hằng ngày</strong> đúng giờ: viết bài → tìm ảnh → kiểm duyệt →{" "}
              <strong>nếu bật "Tự động đăng" VÀ verifier đạt thì đăng live</strong> (kèm tùy chọn tự
              duyệt bản dịch EN/ZH), ngược lại lưu <strong>Chờ duyệt</strong>. Bạn vẫn bấm{" "}
              <strong>"Chạy ngay"</strong> để chạy thủ công. Cột <strong>Kiểm duyệt</strong> hiện
              verdict (di chuột xem lý do).
            </div>
          </div>
        </div>

        {/* Campaigns */}
        <Card>
          <CardHeader
            title="Bots (campaigns)"
            hint="Mỗi bot là một rule riêng: lịch chạy, chủ đề, tone, ảnh, kiểm duyệt."
            action={
              <button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm bot
              </button>
            }
          />
          <div className="p-5">
            {data.campaigns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Chưa có bot nào. Bấm "Thêm bot" để tạo bot đăng blog đầu tiên.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
                    <tr>
                      <th className="text-left font-medium px-5 py-2.5">Tên</th>
                      <th className="text-left font-medium px-3 py-2.5">Lịch</th>
                      <th className="text-left font-medium px-3 py-2.5">Locale</th>
                      <th className="text-left font-medium px-3 py-2.5">Ảnh</th>
                      <th className="text-left font-medium px-3 py-2.5">Đăng</th>
                      <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                      <th className="px-5 py-2.5 w-32 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-muted/30 transition">
                        <td className="px-5 py-3 font-medium">{c.name}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {c.run_time} · {c.max_per_day}/ngày
                        </td>
                        <td className="px-3 py-3 uppercase text-xs">{c.locale}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{c.image_mode}</td>
                        <td className="px-3 py-3">
                          {c.autopublish ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                              Tự động
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                              Chờ duyệt
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {c.enabled ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <Play className="w-3 h-3" /> Đang bật
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Pause className="w-3 h-3" /> Tắt
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleRunNow(c)}
                              disabled={runningId !== null}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50"
                              title="Sinh 1 bài ngay (lưu Chờ duyệt)"
                            >
                              {runningId === c.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              {runningId === c.id ? "Đang chạy…" : "Chạy ngay"}
                            </button>
                            <button
                              onClick={() => handleToggleEnabled(c)}
                              disabled={runningId !== null}
                              className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground disabled:opacity-50"
                              title={c.enabled ? "Tạm dừng" : "Bật"}
                            >
                              {c.enabled ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setEditing(c);
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        {/* Run history */}
        <Card className="mt-5">
          <CardHeader title="Lịch sử chạy" hint="Mỗi lần bot sinh bài (thủ công hoặc theo lịch)." />
          <div className="p-5">
            {data.runs.length === 0 ? (
              <div className="text-sm text-muted-foreground">Chưa có lần chạy nào.</div>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
                    <tr>
                      <th className="text-left font-medium px-5 py-2.5">Thời gian</th>
                      <th className="text-left font-medium px-3 py-2.5">Chủ đề</th>
                      <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                      <th className="text-left font-medium px-3 py-2.5">Kiểm duyệt</th>
                      <th className="text-left font-medium px-3 py-2.5">Bài viết</th>
                      <th className="text-right font-medium px-5 py-2.5">Chi phí</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.runs.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.created_at * 1000).toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3 py-3 max-w-md">
                          <div className="line-clamp-2">{r.topic ?? "—"}</div>
                          {r.error ? (
                            <div className="text-xs text-red-600 mt-0.5 line-clamp-2">
                              {r.error}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <RunStatusPill status={r.status} />
                        </td>
                        <td className="px-3 py-3">
                          <VerdictBadge json={r.verdict_json} />
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {r.blog_slug ? (
                            <a
                              href={`/admin/content/blogs/${r.blog_slug}`}
                              className="text-primary hover:underline"
                            >
                              {r.blog_slug}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {r.cost_usd > 0 ? `$${r.cost_usd.toFixed(4)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </PageContainer>

      {dialogOpen ? (
        <CampaignDialog
          key={editing?.id ?? "new"}
          campaign={editing}
          onClose={() => setDialogOpen(false)}
          onSubmit={async (payload) => {
            try {
              if (editing) {
                await update({ data: { id: editing.id, ...payload } });
                toast.success("Đã cập nhật bot");
              } else {
                await create({ data: payload });
                toast.success("Đã tạo bot");
              }
              setDialogOpen(false);
              await router.invalidate();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Lưu thất bại");
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa bot?"
        description={`Sẽ xóa bot "${confirmDelete?.name}" và toàn bộ lịch sử chạy của nó. Các bài đã đăng vẫn giữ nguyên.`}
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Campaign editor dialog. All bot rule fields in one modal form.
// ──────────────────────────────────────────────────────────────────────────────

interface CampaignPayload {
  name: string;
  enabled: boolean;
  run_time: string;
  locale: "en" | "vi" | "zh";
  category: string | null;
  tone: string | null;
  topic_source: "instruction" | "seed_list";
  instruction_md: string | null;
  seed_topics_json: string | null;
  guidelines_md: string | null;
  article_type: "general" | "listicle" | "news" | "review" | "knowledge" | "product_service";
  length: "short" | "medium" | "long";
  depth: "basic" | "professional" | "expert";
  image_mode: "none" | "ai_generate" | "stock";
  image_style: string | null;
  autopublish: boolean;
  autoapprove_translations: boolean;
  model: "gpt-4o" | "gpt-4o-mini";
  max_per_day: number;
}

const labelCls = "text-xs font-medium text-muted-foreground";
const inputCls =
  "mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const areaCls =
  "mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function nullify(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function CampaignDialog({
  campaign,
  onClose,
  onSubmit,
}: {
  campaign: BlogBotCampaignRow | null;
  onClose: () => void;
  onSubmit: (payload: CampaignPayload) => void | Promise<void>;
}) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [enabled, setEnabled] = useState(campaign ? campaign.enabled === 1 : false);
  const [runTime, setRunTime] = useState(campaign?.run_time ?? "08:00");
  const [locale, setLocale] = useState<CampaignPayload["locale"]>(campaign?.locale ?? "vi");
  const [category, setCategory] = useState(campaign?.category ?? "");
  const [tone, setTone] = useState(campaign?.tone ?? "");
  const [topicSource, setTopicSource] = useState<CampaignPayload["topic_source"]>(
    campaign?.topic_source ?? "instruction",
  );
  const [instruction, setInstruction] = useState(campaign?.instruction_md ?? "");
  // seed topics stored as JSON array; edited as one-per-line for convenience.
  const [seedTopics, setSeedTopics] = useState(() => {
    if (!campaign?.seed_topics_json) return "";
    try {
      const arr = JSON.parse(campaign.seed_topics_json) as unknown;
      return Array.isArray(arr) ? arr.join("\n") : "";
    } catch {
      return "";
    }
  });
  const [guidelines, setGuidelines] = useState(campaign?.guidelines_md ?? "");
  const [articleType, setArticleType] = useState<CampaignPayload["article_type"]>(
    campaign?.article_type ?? "general",
  );
  const [length, setLength] = useState<CampaignPayload["length"]>(campaign?.length ?? "medium");
  const [depth, setDepth] = useState<CampaignPayload["depth"]>(campaign?.depth ?? "professional");
  const [imageMode, setImageMode] = useState<CampaignPayload["image_mode"]>(
    campaign?.image_mode ?? "none",
  );
  const [imageStyle, setImageStyle] = useState(campaign?.image_style ?? "");
  const [autopublish, setAutopublish] = useState(campaign ? campaign.autopublish === 1 : false);
  const [autoApproveTranslations, setAutoApproveTranslations] = useState(
    campaign ? campaign.autoapprove_translations === 1 : false,
  );
  const [model, setModel] = useState<CampaignPayload["model"]>(
    (campaign?.model as CampaignPayload["model"]) ?? "gpt-4o",
  );
  const [maxPerDay, setMaxPerDay] = useState(campaign?.max_per_day ?? 1);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return toast.error("Cần điền tên bot");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(runTime)) return toast.error("Giờ chạy dạng HH:MM");
    let seedJson: string | null = null;
    if (topicSource === "seed_list") {
      const topics = seedTopics
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (topics.length === 0) return toast.error("Danh sách chủ đề đang trống");
      seedJson = JSON.stringify(topics);
    }
    if (topicSource === "instruction" && !instruction.trim()) {
      return toast.error("Cần điền lệnh/hướng dẫn cho bot");
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        enabled,
        run_time: runTime,
        locale,
        category: nullify(category),
        tone: nullify(tone),
        topic_source: topicSource,
        instruction_md: nullify(instruction),
        seed_topics_json: seedJson,
        guidelines_md: nullify(guidelines),
        article_type: articleType,
        length,
        depth,
        image_mode: imageMode,
        image_style: nullify(imageStyle),
        autopublish,
        autoapprove_translations: autoApproveTranslations,
        model,
        max_per_day: maxPerDay,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-background rounded-xl border border-border shadow-2xl w-full max-w-2xl p-5 my-8">
        <div className="mb-4 flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <div className="font-semibold text-base">
            {campaign ? "Sửa bot" : "Bot đăng blog mới"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2">
            <span className={labelCls}>Tên bot</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vd. Blog POD hằng ngày"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className={labelCls}>Giờ chạy (Asia/Ho_Chi_Minh)</span>
            <input
              type="time"
              value={runTime}
              onChange={(e) => setRunTime(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Số bài / ngày</span>
            <input
              type="number"
              min={1}
              max={20}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className={labelCls}>Ngôn ngữ bài viết</span>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as CampaignPayload["locale"])}
              className={inputCls}
            >
              <option value="vi">Tiếng Việt (nguồn)</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Category</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="vd. POD, Fulfillment"
              className={inputCls}
            />
          </label>

          <label className="block col-span-2">
            <span className={labelCls}>Tone / giọng văn</span>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="vd. thân thiện, chuyên gia, ngắn gọn"
              className={inputCls}
            />
          </label>

          <label className="block col-span-2">
            <span className={labelCls}>Loại bài viết</span>
            <select
              value={articleType}
              onChange={(e) => setArticleType(e.target.value as CampaignPayload["article_type"])}
              className={inputCls}
            >
              <option value="general">Chuẩn (general)</option>
              <option value="listicle">Danh sách (listicle — "Top N…")</option>
              <option value="news">Tin tức (news — tự cào tin liên quan + trích nguồn)</option>
              <option value="review">Đánh giá / Review</option>
              <option value="knowledge">Chia sẻ kiến thức (how-to)</option>
              <option value="product_service">Sản phẩm & dịch vụ</option>
            </select>
            {articleType === "news" ? (
              <span className="block text-xs text-muted-foreground mt-1">
                Bot lấy tiêu đề tin gần đây (Google News, theo Category/chủ đề) rồi viết tổng hợp
                nguyên gốc + mục "Nguồn tham khảo" có link. Không cần API key.
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className={labelCls}>Độ dài</span>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value as CampaignPayload["length"])}
              className={inputCls}
            >
              <option value="short">Ngắn (~400–600 từ)</option>
              <option value="medium">Vừa (~700–1100 từ)</option>
              <option value="long">Dài (~1300–2000 từ)</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Độ chuyên sâu</span>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value as CampaignPayload["depth"])}
              className={inputCls}
            >
              <option value="basic">Cơ bản (dễ hiểu)</option>
              <option value="professional">Chuyên nghiệp</option>
              <option value="expert">Chuyên sâu (expert)</option>
            </select>
          </label>

          <label className="block col-span-2">
            <span className={labelCls}>Nguồn chủ đề</span>
            <select
              value={topicSource}
              onChange={(e) => setTopicSource(e.target.value as CampaignPayload["topic_source"])}
              className={inputCls}
            >
              <option value="instruction">Theo lệnh tự nhiên (bot tự nghĩ chủ đề)</option>
              <option value="seed_list">Theo danh sách chủ đề có sẵn</option>
            </select>
          </label>

          {topicSource === "instruction" ? (
            <label className="block col-span-2">
              <span className={labelCls}>Lệnh / hướng dẫn (ngôn ngữ tự nhiên)</span>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={4}
                placeholder="vd. Mỗi ngày viết 1 bài về mẹo bán hàng POD cho seller Việt Nam, tập trung tối ưu chi phí ship, tránh nói về đối thủ..."
                className={areaCls}
              />
            </label>
          ) : (
            <label className="block col-span-2">
              <span className={labelCls}>Danh sách chủ đề (mỗi dòng 1 chủ đề)</span>
              <textarea
                value={seedTopics}
                onChange={(e) => setSeedTopics(e.target.value)}
                rows={4}
                placeholder={
                  "Cách chọn nhà cung cấp POD\nGiảm tỉ lệ hoàn hàng\nTối ưu thời gian ship US"
                }
                className={areaCls}
              />
            </label>
          )}

          <label className="block col-span-2">
            <span className={labelCls}>Guidelines kiểm duyệt (rubric cho bot verifier)</span>
            <textarea
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              rows={3}
              placeholder="vd. Không bịa số liệu về dịch vụ/giá THG. Không hứa hẹn cam kết. Không nội dung nhạy cảm/chính trị..."
              className={areaCls}
            />
          </label>

          <label className="block">
            <span className={labelCls}>Ảnh</span>
            <select
              value={imageMode}
              onChange={(e) => setImageMode(e.target.value as CampaignPayload["image_mode"])}
              className={inputCls}
            >
              <option value="none">Không có ảnh</option>
              <option value="ai_generate">AI sinh ảnh (→ R2)</option>
              <option value="stock">Ảnh stock (Pexels/Unsplash)</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Phong cách ảnh</span>
            <input
              value={imageStyle}
              onChange={(e) => setImageStyle(e.target.value)}
              disabled={imageMode === "none"}
              placeholder="vd. tối giản, thực tế, màu ấm"
              className={`${inputCls} disabled:opacity-50`}
            />
          </label>

          <label className="block">
            <span className={labelCls}>Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as CampaignPayload["model"])}
              className={inputCls}
            >
              <option value="gpt-4o">gpt-4o (chất lượng cao)</option>
              <option value="gpt-4o-mini">gpt-4o-mini (tiết kiệm)</option>
            </select>
          </label>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 h-9 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="accent-foreground w-4 h-4"
              />
              Bật bot ngay
            </label>
          </div>

          <label className="block col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-900">
              <input
                type="checkbox"
                checked={autopublish}
                onChange={(e) => setAutopublish(e.target.checked)}
                className="accent-amber-700 w-4 h-4"
              />
              Tự động đăng (bỏ qua bước người duyệt)
            </span>
            <span className="block text-xs text-amber-900/80 mt-1">
              Khi bật, bài đạt kiểm duyệt an toàn sẽ tự lên "live". Nếu tắt (khuyến nghị), bot chỉ
              tạo bản nháp <strong>Chờ duyệt</strong> để người vào bấm đăng.
            </span>
          </label>

          <label className="block col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-900">
              <input
                type="checkbox"
                checked={autoApproveTranslations}
                onChange={(e) => setAutoApproveTranslations(e.target.checked)}
                disabled={!autopublish}
                className="accent-amber-700 w-4 h-4"
              />
              Tự duyệt bản dịch EN + ZH khi tự động đăng
            </span>
            <span className="block text-xs text-amber-900/80 mt-1">
              Chỉ có tác dụng khi bật "Tự động đăng". Khi bật, bản dịch EN/ZH (do pipeline tạo) sẽ
              tự được duyệt để bài công khai đủ 3 ngôn ngữ. Lưu ý: bản dịch <strong>không</strong>{" "}
              chạy lại verifier — rủi ro còn lại là sai dịch (chất lượng), không phải an toàn. Tắt
              (khuyến nghị) nếu muốn tự soát bản dịch.
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted"
          >
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
