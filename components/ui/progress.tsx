import { cn } from "@/lib/utils";

type ProgressProps = {
  value: number;
  className?: string;
};

export function Progress({ value, className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "h-1.5 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-700/70",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500 ease-out dark:from-indigo-400 dark:to-indigo-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
