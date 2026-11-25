/* eslint-disable @next/next/no-img-element -- small static brand files in /public; no image optimisation needed */
import { cn } from "@/lib/utils";

/**
 * The Targeticon logo. Two files per shape: dark ink for the light theme, light ink for the dark theme
 * (the yellow stays). `mark` is the square "Ti" box for tight spaces such as the collapsed sidebar.
 */
export function BrandLogo({ mark = false, className }: { mark?: boolean; className?: string }) {
  const file = mark ? "targeticon-mark" : "targeticon-logo";
  const alt = mark ? "" : "Targeticon";
  return (
    <>
      <img src={`/brand/${file}.png`} alt={alt} className={cn("w-auto object-contain object-left dark:hidden", className)} />
      <img src={`/brand/${file}-dark.png`} alt={alt} className={cn("hidden w-auto object-contain object-left dark:block", className)} />
    </>
  );
}
