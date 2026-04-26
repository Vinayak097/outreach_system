import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <RD.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
            "card p-6 focus:outline-none",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <RD.Title className="text-h2">{title}</RD.Title>
              {description && (
                <RD.Description className="text-small text-ink-secondary mt-1">
                  {description}
                </RD.Description>
              )}
            </div>
            <RD.Close
              aria-label="Close"
              className="rounded p-1 text-ink-secondary hover:text-ink-primary"
            >
              <X size={16} />
            </RD.Close>
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
