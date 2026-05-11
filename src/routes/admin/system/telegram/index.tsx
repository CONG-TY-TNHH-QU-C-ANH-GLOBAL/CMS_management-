import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Inbox, MessageSquare, Save, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import {
  getTelegramConfigFn,
  updateTelegramConfigFn,
  type TelegramConfig,
} from "@/features/telegram/telegram.actions";

export const Route = createFileRoute("/admin/system/telegram/")({
  head: () => ({ meta: [{ title: "Telegram — THG Content OS" }] }),
  loader: () => getTelegramConfigFn(),
  component: TelegramPage,
});

function TelegramPage() {
  const initial = Route.useLoaderData() as TelegramConfig;
  const router = useRouter();
  const update = useServerFn(updateTelegramConfigFn);

  const [botToken, setBotToken] = useState(initial.bot_token ?? "");
  const [chatIdsText, setChatIdsText] = useState(initial.allowed_chat_ids.join("\n"));
  const [notifyNewLead, setNotifyNewLead] = useState(initial.notify_new_lead);
  const [notifyNewApplicant, setNotifyNewApplicant] = useState(initial.notify_new_applicant);
  const [notifyDraftReview, setNotifyDraftReview] = useState(initial.notify_draft_review);
  const [notifyError, setNotifyError] = useState(initial.notify_error);
  const [pending, setPending] = useState(false);

  const isConfigured = initial.configured;

  const parsedChatIds = useMemo(
    () =>
      chatIdsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [chatIdsText],
  );

  async function save() {
    // Validate chat IDs — must be all-digit (with optional minus for group IDs)
    const invalid = parsedChatIds.filter((id) => !/^-?\d+$/.test(id));
    if (invalid.length > 0) {
      toast.error(`Chat ID không hợp lệ: ${invalid.join(", ")}`);
      return;
    }
    setPending(true);
    try {
      await update({
        data: {
          bot_token: botToken.trim() || null,
          allowed_chat_ids: parsedChatIds,
          notify_new_lead: notifyNewLead,
          notify_new_applicant: notifyNewApplicant,
          notify_draft_review: notifyDraftReview,
          notify_error: notifyError,
        },
      });
      toast.success("Đã lưu cấu hình Telegram");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <CmsTopbar title="Kết nối Telegram" subtitle="Nhận thông báo và điều khiển CMS qua bot Telegram" />
      <PageContainer>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Bot Telegram" hint="Cấu hình bot để nhận thông báo" />
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`grid place-items-center w-12 h-12 rounded-xl ${isConfigured ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
                  {isConfigured ? <Check className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{isConfigured ? "Bot đã kết nối" : "Bot chưa kết nối"}</div>
                  <div className="text-xs text-muted-foreground">
                    {isConfigured
                      ? `${initial.allowed_chat_ids.length} chat ID được phép gửi lệnh`
                      : "Thêm bot token để bắt đầu nhận thông báo"}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${isConfigured ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-muted text-muted-foreground border-border"}`}>
                  {isConfigured ? "Đang hoạt động" : "Chưa cấu hình"}
                </span>
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Bot token (lấy từ @BotFather)</span>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="123456789:ABCDef..."
                    className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-[10px] text-muted-foreground">Token được lưu mã hóa — không hiển thị lại sau khi lưu.</span>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">
                    Chat ID được phép gửi lệnh ({parsedChatIds.length}) — mỗi dòng 1 ID, số nguyên (group chat có dấu trừ đầu)
                  </span>
                  <textarea
                    rows={4}
                    value={chatIdsText}
                    onChange={(e) => setChatIdsText(e.target.value)}
                    placeholder="123456789&#10;-987654321"
                    className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                </label>
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                <strong>Hướng dẫn:</strong> Tạo bot mới qua <code className="font-mono px-1 bg-white rounded">@BotFather</code> trên Telegram để lấy token. Sau đó nhắn cho bot và xem chat ID ở <code className="font-mono px-1 bg-white rounded">@userinfobot</code>.
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Hoạt động gần đây" hint="Lệnh và thông báo bot đã gửi" />
            <div className="p-10 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted grid place-items-center mb-3">
                <Inbox className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">
                {isConfigured ? "Chưa có hoạt động" : "Chưa có hoạt động nào"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {isConfigured
                  ? "Sau khi worker Telegram kích hoạt, lệnh và thông báo gửi qua bot sẽ hiện ở đây."
                  : "Sau khi kết nối bot, các lệnh và thông báo gửi qua Telegram sẽ hiện ở đây."}
              </p>
            </div>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader title="Các loại thông báo" hint="Chọn sự kiện gửi qua Telegram khi bot đã kết nối" />
          <div className="p-5 grid sm:grid-cols-2 gap-3">
            <NotifyToggle
              label="Có khách điền form đăng ký tư vấn"
              desc="Bot nhắn ngay khi có lead mới"
              checked={notifyNewLead}
              onChange={setNotifyNewLead}
            />
            <NotifyToggle
              label="Có ứng viên ứng tuyển việc làm"
              desc="Thông báo khi có CV mới"
              checked={notifyNewApplicant}
              onChange={setNotifyNewApplicant}
            />
            <NotifyToggle
              label="Có bản nháp chờ duyệt"
              desc="Nhắc khi cộng tác viên gửi nội dung mới"
              checked={notifyDraftReview}
              onChange={setNotifyDraftReview}
            />
            <NotifyToggle
              label="Có lỗi hệ thống"
              desc="Báo khi API hoặc Worker gặp sự cố"
              checked={notifyError}
              onChange={setNotifyError}
            />
          </div>
        </Card>

        {/* Save bar */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-soft"
          >
            <Save className="w-4 h-4" /> {pending ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      </PageContainer>
    </>
  );
}

function NotifyToggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface hover:bg-surface-muted transition cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-foreground"
      />
      <div className="flex-1">
        <div className="text-sm font-medium flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          {label}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
    </label>
  );
}
