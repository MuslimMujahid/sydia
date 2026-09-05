import { useState, type ComponentProps, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type CodeBlockProps = ComponentProps<"div"> & {
  code: string;
  children?: ReactNode;
};

function CodeBlock({ className, code, children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      data-slot="code-block"
      className={cn("relative rounded-md bg-editorial p-4", className)}
      {...props}
    >
      <pre className="overflow-x-auto font-mono text-xs leading-[18px] text-canvas">
        <code>{children ?? code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute top-3 right-3 rounded-sm p-1 text-canvas/60 transition-colors hover:text-canvas focus-visible:ring-3 focus-visible:ring-brand/40 focus-visible:outline-none"
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}

export { CodeBlock };
export type { CodeBlockProps };
