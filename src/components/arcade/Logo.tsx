import { cn } from "@/lib/utils";

// Two overlapping signal rings in the player colours: two people, one screen.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1c2b" />
          <stop offset="1" stopColor="#0d0e17" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-bg)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="white" strokeOpacity="0.1" />
      <circle cx="12.5" cy="16" r="6" fill="none" stroke="var(--p1)" strokeWidth="2.6" />
      <circle cx="19.5" cy="16" r="6" fill="none" stroke="var(--p2)" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="1.8" fill="white" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-lg font-bold tracking-wide">GALAWGAW</span>
    </span>
  );
}
