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
  { to: "/", label: "Dashboard", group: "Điều hướng", icon: LayoutDashboard },
  { to: "/landing", label: "Landing Page", group: "Website", icon: Home, keywords: "trang chủ hero" },
  { to: "/services", label: "Services", group: "Website", icon: Boxes, keywords: "dịch vụ" },
  { to: "/pricing", label: "Pricing — Quốc tế", group: "Website", icon: DollarSign, keywords: "giá vận chuyển" },
  { to: "/pricing/us", label: "Pricing — US Domestic", group: "Website", icon: DollarSign, keywords: "kho mỹ" },
  { to: "/faqs", label: "FAQ", group: "Website", icon: HelpCircle },
  { to: "/testimonials", label: "Testimonials", group: "Website", icon: MessageSquareQuote, keywords: "đánh giá review" },
  { to: "/marketplaces", label: "Marketplaces", group: "Website", icon: Plug, keywords: "shopify amazon" },
  { to: "/gallery", label: "Gallery", group: "Website", icon: Images, keywords: "hình kho ảnh" },
  { to: "/contact", label: "Contact & Offices", group: "Website", icon: MapPin, keywords: "liên hệ văn phòng" },
  { to: "/blogs", label: "Blog Posts", group: "Nội dung", icon: FileText, keywords: "bài viết" },
  { to: "/careers", label: "Tuyển dụng", group: "Nội dung", icon: Briefcase, keywords: "jobs hr" },
  { to: "/policies", label: "Policies", group: "Nội dung", icon: Scroll },
  { to: "/media", label: "Media Library", group: "Nội dung", icon: ImageIcon, keywords: "ảnh video" },
  { to: "/agent-jobs", label: "Agent Jobs", group: "Agent Studio", icon: Bot, keywords: "ai" },
  { to: "/sources", label: "Source Inbox", group: "Agent Studio", icon: Inbox },
  { to: "/change-requests", label: "Change Requests", group: "Agent Studio", icon: GitPullRequest },
  { to: "/reviews", label: "Chờ duyệt", group: "Duyệt", icon: CheckCheck },
  { to: "/history", label: "Lịch sử publish", group: "Duyệt", icon: History },
  { to: "/users", label: "Users & Roles", group: "Cài đặt", icon: Users },
  { to: "/telegram", label: "Telegram", group: "Cài đặt", icon: Send },
  { to: "/audit", label: "Audit Logs", group: "Cài đặt", icon: ShieldCheck },
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
