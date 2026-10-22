import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { VerificationShell } from "./verification-shell";

interface AuthRecoveryScreenProps {
  title: string;
  message: string;
  children: ReactNode;
}

export function AuthRecoveryScreen({
  title,
  message,
  children,
}: AuthRecoveryScreenProps) {
  return (
    <VerificationShell screen="recovery" title={title} description={null}>
      <div
        role="alert"
        className="mb-[34px] flex min-h-[82px] items-start gap-3 rounded-sm bg-destructive/5 px-4 pt-[14px] pb-1.5 text-sm leading-[20.5px] text-red-700"
      >
        <AlertCircle className="mt-0.5 size-[18px] shrink-0" />
        <p className="whitespace-pre-line">{message}</p>
      </div>
      {children}
    </VerificationShell>
  );
}
