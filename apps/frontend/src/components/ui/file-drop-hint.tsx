import { Upload } from "lucide-react";

type FileDropHintProps = {
  children: string;
};

export function FileDropHint({ children }: FileDropHintProps) {
  return (
    <div className="pointer-events-none sticky top-0 z-40 mx-auto h-0 w-full max-w-sm shrink-0 px-4">
      <p className="relative top-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-brand-deep bg-canvas px-4 py-3 text-center text-sm font-medium text-ink">
        <Upload
          className="size-4 shrink-0 text-brand-deep"
          aria-hidden="true"
        />
        {children}
      </p>
    </div>
  );
}
