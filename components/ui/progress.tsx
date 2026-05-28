import { cn } from "@/lib/utils";

type ProgressProps = {
  value: number;
  className?: string;
  tone?: "default" | "fire" | "sleep";
};

export function Progress({ value, className, tone = "default" }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  const fill =
    tone === "fire"
      ? "bg-gradient-to-r from-[color:var(--fire)] to-[oklch(70%_0.18_50)]"
      : tone === "sleep"
        ? "bg-[color:var(--block-sleep)]"
        : "bg-[color:var(--ink)]";

  return (
    <div
      className={cn(
        "h-2 overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)] dark:bg-[rgba(255,255,255,0.08)]",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500 ease-out", fill)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
