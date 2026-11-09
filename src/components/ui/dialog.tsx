import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, side, ...p }: React.ComponentProps<typeof D.Content> & { side?: "right" | "left" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <D.Content
        className={cn(
          "fixed z-50 border border-border bg-popover p-5 shadow-2xl focus:outline-none",
          side
            ? cn("inset-y-0 w-[88vw] max-w-sm overflow-y-auto data-[state=open]:animate-in", side === "right" ? "right-0 data-[state=open]:slide-in-from-right" : "left-0 data-[state=open]:slide-in-from-left")
            : "left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl data-[state=open]:animate-in data-[state=open]:zoom-in-95",
          className,
        )}
        {...p}
      >
        {children}
        <D.Close className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-3" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
export function DialogTitle({ className, ...p }: React.ComponentProps<typeof D.Title>) {
  return <D.Title className={cn("text-lg font-semibold", className)} {...p} />;
}
export function DialogDescription({ className, ...p }: React.ComponentProps<typeof D.Description>) {
  return <D.Description className={cn("mt-1 text-sm text-muted-foreground", className)} {...p} />;
}
