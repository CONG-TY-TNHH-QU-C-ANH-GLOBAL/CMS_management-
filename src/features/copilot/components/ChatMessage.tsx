import { Bot, User, Wrench } from "lucide-react";

import type { ChatMessageRow } from "@/features/copilot/copilot.actions";

interface Props {
  message: ChatMessageRow;
}

export function ChatMessage({ message }: Props) {
  if (message.role === "tool") {
    // Don't render raw tool JSON inline — it clutters. Show a compact hint
    // so the user knows the model fetched something. Approval cards render
    // separately based on change_request rows.
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-2">
        <Wrench className="w-3 h-3" />
        <span>Đã đọc dữ liệu</span>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex gap-2 justify-end">
        <div className="bg-foreground text-background rounded-2xl rounded-tr-sm px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words">
          {message.content}
        </div>
        <div className="w-6 h-6 rounded-full bg-surface-muted grid place-items-center text-muted-foreground shrink-0">
          <User className="w-3.5 h-3.5" />
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full bg-foreground text-background grid place-items-center shrink-0">
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div className="bg-surface-muted rounded-2xl rounded-tl-sm px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words">
        {message.content || <span className="text-muted-foreground italic text-xs">(đang chuẩn bị đề xuất…)</span>}
      </div>
    </div>
  );
}
