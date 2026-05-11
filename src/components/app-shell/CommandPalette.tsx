import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Home, FileText, Boxes, DollarSign, HelpCircle, Scroll,
  Image as ImageIcon, Bot, Inbox, GitPullRequest, CheckCheck, History,
  Users, Send, ShieldCheck, Briefcase, MessageSquareQuote,
  Plug, Images, MapPin, Plus, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type Item = { to: string; label: string; group: string; icon: any; keywords?: string };

const ITEMS: Item[] = [
  { to: "/", label: "Bảng điều khiển", group: "Điều hướng", icon: LayoutDashboard, keywords: "dashboard" },
  { to: "/landing", label: "Trang chủ", group: "Trang web", icon: Home, keywords: "landing hero" },
  { to: "/services", label: "Dịch vụ", group: "Trang web", icon: Boxes, keywords: "services" },
  { to: "/pricing", label: "Bảng giá — Quốc tế", group: "Trang web", icon: DollarSign, keywords: "giá vận chuyển pricing" },
  { to: "/pricing/us", label: "Bảng giá — Nội địa US", group: "Trang web", icon: DollarSign, keywords: "kho mỹ" },
  { to: "/faqs", label: "Câu hỏi thường gặp", group: "Trang web", icon: HelpCircle, keywords: "faq" },
  { to: "/testimonials", label: "Đánh giá khách hàng", group: "Trang web", icon: MessageSquareQuote, keywords: "review testimonial" },
  { to: "/marketplaces", label: "Sàn thương mại", group: "Trang web", icon: Plug, keywords: "shopify amazon tiktok" },
  { to: "/gallery", label: "Thư viện ảnh", group: "Trang web", icon: Images, keywords: "gallery hình kho" },
  { to: "/contact", label: "Liên hệ & Văn phòng", group: "Trang web", icon: MapPin, keywords: "contact office" },
  { to: "/blogs", label: "Bài viết Blog", group: "Nội dung", icon: FileText, keywords: "blog post" },
  { to: "/careers", label: "Tuyển dụng", group: "Nội dung", icon: Briefcase, keywords: "careers jobs hr" },
  { to: "/policies", label: "Chính sách", group: "Nội dung", icon: Scroll, keywords: "policy" },
  { to: "/media", label: "Thư viện media", group: "Nội dung", icon: ImageIcon, keywords: "media ảnh video" },
  { to: "/agent-jobs", label: "Tác vụ AI", group: "Trợ lý AI", icon: Bot, keywords: "agent jobs" },
  { to: "/sources", label: "Hộp thư nguồn", group: "Trợ lý AI", icon: Inbox, keywords: "source" },
  { to: "/change-requests", label: "Yêu cầu thay đổi", group: "Trợ lý AI", icon: GitPullRequest, keywords: "change request" },
  { to: "/reviews", label: "Chờ duyệt", group: "Phê duyệt", icon: CheckCheck },
  { to: "/history", label: "Lịch sử xuất bản", group: "Phê duyệt", icon: History, keywords: "publish" },
  { to: "/users", label: "Người dùng & Phân quyền", group: "Hệ thống", icon: Users, keywords: "users roles" },
  { to: "/telegram", label: "Tích hợp Telegram", group: "Hệ thống", icon: Send },
  { to: "/audit", label: "Nhật ký bảo mật", group: "Hệ thống", icon: ShieldCheck, keywords: "audit log" },
];

const ACTIONS = [
  { id: "new-blog", label: "Tạo bài blog mới", icon: Plus, hint: "B" },
  { id: "new-job", label: "Đăng tin tuyển dụng", icon: Plus, hint: "J" },
  { id: "ai-draft", label: "Dùng AI viết bản nháp", icon: Sparkles, hint: "A" },
  { id: "publish", label: "Publish các thay đổi đang chờ", icon: CheckCheck, hint: "P" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cms:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cms:open-palette", onOpen);
    };
  }, []);

  const groups = Array.from(new Set(ITEMS.map((i) => i.group)));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Tìm trang, hành động, nội dung…" />
      <CommandList>
        <CommandEmpty>Không có kết quả phù hợp.</CommandEmpty>
        <CommandGroup heading="Hành động nhanh">
          {ACTIONS.map((a) => (
            <CommandItem
              key={a.id}
              value={`action ${a.label}`}
              onSelect={() => {
                setOpen(false);
                toast.success(a.label, { description: "Đã ghi nhận (mock)." });
              }}
            >
              <a.icon className="w-4 h-4" />
              <span>{a.label}</span>
              <kbd className="ml-auto text-[10px] font-mono bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                {a.hint}
              </kbd>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        {groups.map((g) => (
          <CommandGroup key={g} heading={g}>
            {ITEMS.filter((i) => i.group === g).map((i) => (
              <CommandItem
                key={i.to}
                value={`${i.label} ${i.keywords ?? ""} ${i.group}`}
                onSelect={() => {
                  setOpen(false);
                  navigate({ to: i.to });
                }}
              >
                <i.icon className="w-4 h-4" />
                <span>{i.label}</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">{i.to}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
