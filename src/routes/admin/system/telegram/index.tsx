import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Bot,
  Check,
  Edit3,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import { EVENT_TYPES, type ChannelKind, type EventType } from "@/features/telegram/telegram.events";
import {
  deleteTelegramChannelFn,
  getLegacyConfigSummaryFn,
  getTelegramConfigFn,
  importLegacyTelegramConfigFn,
  listFailedOutboxFn,
  listTelegramChannelsFn,
  listTelegramSubscriptionsFn,
  retryOutboxFn,
  sendChannelTestFn,
  testBotTokenFn,
  toggleChannelPauseFn,
  toggleSubscriptionFn,
  updateTelegramConfigFn,
  upsertTelegramChannelFn,
  type LegacyConfigSummary,
  type OutboxRow,
  type TelegramChannel,
  type TelegramConfig,
  type TelegramSubscription,
} from "@/features/telegram/telegram.actions";

interface LoaderData {
  config: TelegramConfig;
  channels: TelegramChannel[];
  subscriptions: TelegramSubscription[];
  legacy: LegacyConfigSummary;
  failed: OutboxRow[];
}

export const Route = createFileRoute("/admin/system/telegram/")({
  head: () => ({ meta: [{ title: "Telegram — THG Content OS" }] }),
  loader: async (): Promise<LoaderData> => {
    const [config, channelsRes, subsRes, legacy, failedRes] = await Promise.all([
      getTelegramConfigFn(),
      listTelegramChannelsFn(),
      listTelegramSubscriptionsFn(),
      getLegacyConfigSummaryFn(),
      listFailedOutboxFn({ data: {} }),
    ]);
    return {
      config,
      channels: channelsRes.channels,
      subscriptions: subsRes.subscriptions,
      legacy,
      failed: failedRes.rows,
    };
  },
  component: TelegramPage,
});

function maskChatId(s: string): string {
  if (s.length <= 6) return s;
  return s.slice(0, 2) + "•••" + s.slice(-4);
}

function TelegramPage() {
  const data = Route.useLoaderData() as LoaderData;
  const router = useRouter();

  // Bot token state.
  const [botToken, setBotToken] = useState(data.config.bot_token ?? "");
  const [savingToken, setSavingToken] = useState(false);
  const [testingBot, setTestingBot] = useState(false);
  const [botTestResult, setBotTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Channel CRUD state.
  const [editingChannel, setEditingChannel] = useState<TelegramChannel | null>(null);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TelegramChannel | null>(null);

  // Mutations
  const update = useServerFn(updateTelegramConfigFn);
  const testBot = useServerFn(testBotTokenFn);
  const upsertChannel = useServerFn(upsertTelegramChannelFn);
  const deleteChannel = useServerFn(deleteTelegramChannelFn);
  const togglePause = useServerFn(toggleChannelPauseFn);
  const toggleSub = useServerFn(toggleSubscriptionFn);
  const sendTest = useServerFn(sendChannelTestFn);
  const importLegacy = useServerFn(importLegacyTelegramConfigFn);
  const retry = useServerFn(retryOutboxFn);

  // Build a quick subscription lookup: `${channelId}:${eventType}` → enabled.
  const subMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const s of data.subscriptions) m.set(`${s.channel_id}:${s.event_type}`, s.enabled);
    return m;
  }, [data.subscriptions]);

  useEffect(() => setBotToken(data.config.bot_token ?? ""), [data.config.bot_token]);

  // ─── Bot token ────────────────────────────────────────────────────────────
  async function saveToken() {
    setSavingToken(true);
    try {
      await update({ data: { bot_token: botToken.trim() || null } });
      toast.success("Đã lưu bot token");
      setBotTestResult(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSavingToken(false);
    }
  }

  async function runBotTest() {
    setTestingBot(true);
    setBotTestResult(null);
    try {
      const res = (await testBot()) as { ok: true; username: string } | { ok: false; error: string };
      if (res.ok) setBotTestResult({ ok: true, msg: `@${res.username}` });
      else setBotTestResult({ ok: false, msg: res.error });
    } catch (err) {
      setBotTestResult({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestingBot(false);
    }
  }

  // ─── Legacy import ────────────────────────────────────────────────────────
  async function handleLegacyImport() {
    try {
      const res = await importLegacy();
      toast.success(`Đã import: ${res.channelsCreated} kênh, ${res.subscriptionsCreated} subscription`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import thất bại");
    }
  }

  // ─── Channel CRUD ─────────────────────────────────────────────────────────
  async function handleTogglePause(c: TelegramChannel) {
    try {
      await togglePause({ data: { id: c.id, paused: !c.paused } });
      toast.success(c.paused ? "Đã bật kênh" : "Đã tạm dừng kênh");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật thất bại");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteChannel({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa kênh");
      setConfirmDelete(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  async function handleSendTest(c: TelegramChannel) {
    try {
      const res = (await sendTest({ data: { id: c.id } })) as { ok: true } | { ok: false; error: string };
      if (res.ok) toast.success(`Đã gửi test → ${c.label}`);
      else toast.error(`Test thất bại: ${res.error}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gửi test thất bại");
    }
  }

  // ─── Subscription toggle ──────────────────────────────────────────────────
  async function handleToggleSub(channelId: number, eventType: EventType, enabled: boolean) {
    try {
      await toggleSub({ data: { channel_id: channelId, event_type: eventType, enabled } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật subscription thất bại");
    }
  }

  // ─── Retry failed outbox ──────────────────────────────────────────────────
  async function handleRetry(id: number) {
    try {
      await retry({ data: { id } });
      toast.success("Đã đẩy lại — kiểm tra sau vài giây");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry thất bại");
    }
  }

  const showLegacyBanner =
    data.legacy.hasLegacyChatIds &&
    !data.legacy.anyChannelsExist;

  return (
    <>
      <CmsTopbar
        title="Kết nối Telegram"
        subtitle="Định tuyến sự kiện CMS đến các kênh Telegram (Ops + Infra)"
      />
      <PageContainer>
        {/* Legacy banner */}
        {showLegacyBanner ? (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">Bạn có cấu hình cũ chưa migrate</div>
              <div className="text-amber-900/80 mt-0.5">
                Cấu hình singleton trước đây có {data.legacy.legacyChatIdCount} chat ID + {data.legacy.enabledFlagCount} cờ bật. Bấm "Import" để chuyển thành kênh + subscription tương ứng (kind=ops). An toàn, có thể chỉnh sửa sau.
              </div>
            </div>
            <button
              onClick={handleLegacyImport}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 shrink-0"
            >
              Import từ cấu hình cũ
            </button>
          </div>
        ) : null}

        {/* Section 1: Bot token + Test bot */}
        <Card>
          <CardHeader title="Bot Telegram" hint="Tài khoản bot dùng để gửi tin nhắn — lấy token từ @BotFather" />
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`grid place-items-center w-12 h-12 rounded-xl ${data.config.configured ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
                {data.config.configured ? <Check className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{data.config.configured ? "Bot đã kết nối" : "Bot chưa kết nối"}</div>
                <div className="text-xs text-muted-foreground">
                  {data.config.configured
                    ? "Token đã lưu. Tin nhắn được gửi qua bot này tới tất cả kênh."
                    : "Thêm bot token để bắt đầu gửi thông báo."}
                </div>
              </div>
              {botTestResult ? (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${
                    botTestResult.ok
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-red-100 text-red-800 border-red-300"
                  }`}
                >
                  {botTestResult.ok ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {botTestResult.msg}
                </span>
              ) : null}
            </div>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Bot token</span>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCDef..."
                className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={saveToken}
                disabled={savingToken}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {savingToken ? "Đang lưu…" : "Lưu token"}
              </button>
              <button
                onClick={runBotTest}
                disabled={testingBot || !data.config.bot_token}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {testingBot ? "Đang test…" : "Test bot (getMe)"}
              </button>
            </div>
          </div>
        </Card>

        {/* Section 2: Channels */}
        <Card className="mt-5">
          <CardHeader
            title="Kênh Telegram"
            hint="Mỗi kênh là một group/channel nhận tin. kind = ops (kinh doanh) / infra (kỹ thuật) / custom."
          />
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {data.channels.length} kênh — {data.channels.filter((c) => !c.paused).length} đang hoạt động
              </div>
              <button
                onClick={() => {
                  setEditingChannel(null);
                  setChannelDialogOpen(true);
                }}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm kênh
              </button>
            </div>
            {data.channels.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Chưa có kênh nào. Thêm kênh đầu tiên (vd. THG-Ops, kind=ops) để bắt đầu nhận lead.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
                    <tr>
                      <th className="text-left font-medium px-5 py-2.5">Label</th>
                      <th className="text-left font-medium px-3 py-2.5">Chat ID</th>
                      <th className="text-left font-medium px-3 py-2.5">Kind</th>
                      <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                      <th className="px-5 py-2.5 w-44 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.channels.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-muted/30 transition">
                        <td className="px-5 py-3 font-medium">{c.label}</td>
                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{maskChatId(c.chat_id)}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-medium ${
                              c.kind === "ops"
                                ? "bg-blue-100 text-blue-800"
                                : c.kind === "infra"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {c.kind}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {c.paused ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <Pause className="w-3 h-3" /> Đã tạm dừng
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <Play className="w-3 h-3" /> Đang chạy
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSendTest(c)}
                              className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                              title="Gửi test message"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleTogglePause(c)}
                              className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                              title={c.paused ? "Bật" : "Tạm dừng"}
                            >
                              {c.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => {
                                setEditingChannel(c);
                                setChannelDialogOpen(true);
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

        {/* Section 3: Subscriptions matrix */}
        <Card className="mt-5">
          <CardHeader
            title="Subscription matrix"
            hint="Tick ô để gửi event_type tương ứng đến kênh — mỗi cột là 1 kênh, mỗi dòng là 1 loại sự kiện."
          />
          <div className="p-5">
            {data.channels.length === 0 ? (
              <div className="text-sm text-muted-foreground">Thêm kênh trước rồi mới chọn subscription.</div>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
                    <tr>
                      <th className="text-left font-medium px-5 py-2.5 min-w-75">Sự kiện</th>
                      {data.channels.map((c) => (
                        <th key={c.id} className="text-center font-medium px-3 py-2.5 min-w-27.5">
                          <div className="font-semibold text-foreground">{c.label}</div>
                          <div className="text-[10px] text-muted-foreground font-normal">{c.kind}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {EVENT_TYPES.map((e) => (
                      <tr key={e.type}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-sm">{e.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{e.description}</div>
                          <div className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">{e.type}</div>
                        </td>
                        {data.channels.map((c) => {
                          const enabled = subMap.get(`${c.id}:${e.type}`) === true;
                          return (
                            <td key={c.id} className="px-3 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(ev) => handleToggleSub(c.id, e.type, ev.target.checked)}
                                className="accent-foreground w-4 h-4"
                                title={`${enabled ? "Bỏ" : "Bật"} subscription ${e.type} → ${c.label}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        {/* Section 4: Failed sends */}
        <Card className="mt-5">
          <CardHeader title="Tin nhắn gửi lỗi" hint="Sau 5 lần thử thất bại — bấm Retry để đẩy lại." />
          <div className="p-5">
            {data.failed.length === 0 ? (
              <div className="text-sm text-muted-foreground">Chưa có tin nhắn nào thất bại — outbox sạch.</div>
            ) : (
              <div className="space-y-2">
                {data.failed.map((f) => {
                  const channel = data.channels.find((c) => c.id === f.channel_id);
                  const when = f.failed_permanently_at
                    ? new Date(f.failed_permanently_at * 1000).toLocaleString("vi-VN")
                    : "—";
                  return (
                    <div key={f.id} className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-red-900">
                          <span className="font-mono font-medium">{f.event_type}</span> →{" "}
                          <span className="font-medium">{channel?.label ?? `Channel #${f.channel_id}`}</span>
                          <span className="text-red-700"> • {when} • {f.attempts} lần thử</span>
                        </div>
                        <div className="text-xs text-red-900/80 mt-1 line-clamp-2">{f.last_error ?? "—"}</div>
                      </div>
                      <button
                        onClick={() => handleRetry(f.id)}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-red-300 bg-white text-xs font-medium text-red-700 hover:bg-red-100 shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Retry
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </PageContainer>

      {channelDialogOpen ? (
        <ChannelDialog
          key={editingChannel?.id ?? "new"}
          channel={editingChannel}
          onClose={() => setChannelDialogOpen(false)}
          onSubmit={async (payload) => {
            try {
              await upsertChannel({ data: payload });
              toast.success(editingChannel ? "Đã cập nhật kênh" : "Đã thêm kênh");
              setChannelDialogOpen(false);
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
        title="Xóa kênh Telegram?"
        description={`Sẽ xóa kênh "${confirmDelete?.label}" và toàn bộ subscription của nó. Tin nhắn đang chờ trong outbox sẽ không được gửi.`}
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Inline channel dialog. Simple form (label, chat_id, kind) — modal overlay.
// ──────────────────────────────────────────────────────────────────────────────
function ChannelDialog({
  channel,
  onClose,
  onSubmit,
}: {
  channel: TelegramChannel | null;
  onClose: () => void;
  onSubmit: (payload: { id?: number; label: string; chat_id: string; kind: ChannelKind }) => void | Promise<void>;
}) {
  const [label, setLabel] = useState(channel?.label ?? "");
  const [chatId, setChatId] = useState(channel?.chat_id ?? "");
  const [kind, setKind] = useState<ChannelKind>(channel?.kind ?? "ops");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!label.trim()) return toast.error("Cần điền label");
    if (!/^-?\d+$/.test(chatId.trim())) return toast.error("Chat ID phải là số nguyên (có thể bắt đầu bằng -)");
    setSubmitting(true);
    try {
      await onSubmit({
        id: channel?.id,
        label: label.trim(),
        chat_id: chatId.trim(),
        kind,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="bg-background rounded-xl border border-border shadow-2xl w-full max-w-md p-5">
        <div className="mb-4">
          <div className="font-semibold text-base">{channel ? "Sửa kênh" : "Thêm kênh"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            chat_id lấy bằng cách add bot vào group, gửi tin nhắn, GET{" "}
            <code className="font-mono">/getUpdates</code>.
          </div>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="vd. THG-Ops"
              className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Chat ID</span>
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-1001234567890"
              className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ChannelKind)}
              className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="ops">ops — kinh doanh / vận hành</option>
              <option value="infra">infra — kỹ thuật / hạ tầng</option>
              <option value="custom">custom — tùy biến</option>
            </select>
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
