import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <div className="grid justify-items-center gap-1.5">
        <BrandLogo className="h-10" />
        <span className="text-sm text-muted-foreground">MasterAtlas AI · Vendor intelligence</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
