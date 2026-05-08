import type { ReactNode } from "react";
import BrandMark from "@/components/layout/BrandMark";
import { cn } from "@/lib/utils";

export default function AuthCardShell({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_rgba(22,78,99,0.18),transparent_35%),linear-gradient(180deg,#f8f5ee_0%,#edf4f7_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden lg:block">
          <div className="max-w-xl space-y-6">
            <BrandMark className="h-16 w-16" />
            <div className="space-y-3">
              <div className="text-4xl font-semibold tracking-tight">{title}</div>
              <div className={cn("text-base leading-7 text-slate-600")}>{subtitle}</div>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <BrandMark className="h-11 w-11" />
              <div>
                <div className="text-lg font-semibold">{title}</div>
                <div className="text-sm text-slate-600">{subtitle}</div>
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
