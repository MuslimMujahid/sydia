import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/auth/google-button";
import { authMethodsQueryOptions } from "@/lib/services/api/auth/auth.queries";
import { cn } from "@/lib/utils/cn";

export function SignInMethods() {
  const methods = useQuery(authMethodsQueryOptions());

  return (
    <>
      <Card
        className={cn(
          "rounded-md p-6 pt-[26px] shadow-none sm:p-8 sm:pt-[26px] lg:-mt-3",
          methods.data?.password !== false && "min-h-[416px] sm:min-h-[302px]",
          methods.data?.google ? "sm:pb-4" : "sm:pb-5"
        )}
        aria-labelledby="sign-in-methods-title"
        role="region"
      >
        <h2
          id="sign-in-methods-title"
          className="text-[17px] leading-[25px] font-semibold"
        >
          Cara masuk
        </h2>
        <p className="mt-[9px] text-sm leading-5 text-ink-muted">
          Kelola metode masuk ke akun Sydia Anda.
        </p>
        {methods.isPending ? (
          <div
            className="mt-[34px] h-40 animate-pulse rounded-sm bg-surface-1"
            aria-label="Memuat metode masuk"
            aria-busy="true"
          />
        ) : methods.isError ? (
          <div className="mt-7 space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {methods.error.message}
            </p>
            <Button
              variant="dark-outline"
              onClick={() => void methods.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        ) : (
          <div className="mt-[34px] divide-y divide-ink/8 border-t border-ink/8">
            {methods.data.password && (
              <div className="flex items-center justify-between gap-4 pt-4 pb-[18px] sm:pb-2">
                <h3 className="text-[15px] leading-[22px] font-semibold">
                  Kata sandi
                </h3>
                <Link
                  to="/forgot-password"
                  className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold underline underline-offset-4"
                >
                  Ubah kata sandi
                </Link>
              </div>
            )}
            <div className="flex flex-col gap-8 pt-[26px] sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex items-start gap-3">
                <GoogleMark className="mt-1 size-5" />
                <div>
                  <h3 className="text-[15px] leading-[22px] font-semibold">
                    Google
                  </h3>
                  {methods.data.googleEmail && (
                    <p className="mt-2.5 text-sm leading-5 text-ink-muted">
                      {methods.data.googleEmail}
                    </p>
                  )}
                  {methods.data.google ? (
                    <p
                      className={cn(
                        "text-[13px] leading-[19px] text-ink-muted",
                        methods.data.googleEmail
                          ? "-ml-8 mt-[26px] sm:hidden"
                          : "mt-2"
                      )}
                    >
                      {methods.data.googleEmail
                        ? "Terhubung untuk masuk ke Sydia."
                        : "Email Google belum dapat ditampilkan. Masuk lagi dengan Google untuk memperbarui."}
                    </p>
                  ) : (
                    <p className="mt-[18px] -ml-8 text-[13px] leading-[19px] text-ink-muted sm:hidden">
                      Belum terhubung untuk masuk.
                    </p>
                  )}
                </div>
              </div>
              {!methods.data.google && (
                <Link
                  to="/link-google"
                  className="inline-flex min-h-12 items-center justify-center rounded-sm border border-ink/16 px-5 text-sm font-semibold sm:-mt-1 sm:w-[184px]"
                >
                  Hubungkan Google
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
