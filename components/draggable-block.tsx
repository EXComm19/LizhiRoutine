"use client";

import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryTokens, type ColorTokens } from "@/lib/colors";
import type { Category, DragPayload } from "@/lib/types";
import { formatDuration } from "@/lib/time";

type DraggableBlockProps = {
  id: string;
  title: string;
  category: Category;
  durationMinutes: number;
  dragData: DragPayload;
  compact?: boolean;
  disabled?: boolean;
  inverse?: boolean;
  className?: string;
  style?: CSSProperties;
  colorTokens?: ColorTokens;
  icon?: ReactNode;
  children?: ReactNode;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
};

export function DraggableBlock({
  id,
  title,
  category,
  durationMinutes,
  dragData,
  compact,
  disabled,
  inverse,
  className,
  style,
  colorTokens,
  icon,
  children,
  onDoubleClick,
}: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: dragData,
      disabled,
    });
  const tokens = colorTokens ?? categoryTokens(category);
  const transformStyle = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...transformStyle }}
      className={cn(
        "group relative cursor-grab select-none touch-none overflow-hidden rounded-lg border transition-all duration-150 active:cursor-grabbing",
        "hover:shadow-sm hover:border-zinc-200 dark:hover:border-zinc-700",
        compact ? "px-2 py-1 pl-3" : "p-3 pl-3.5",
        tokens.block,
        isDragging && "z-50 opacity-90 shadow-lg shadow-zinc-900/10",
        disabled && "cursor-default active:cursor-default",
        className,
      )}
      {...(!disabled ? listeners : undefined)}
      {...attributes}
      onDoubleClick={onDoubleClick}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1.5 left-1.5 w-0.5 rounded-full",
          inverse ? "bg-white/70" : tokens.accent,
        )}
      />
      {children ?? (
        <div
          className={cn(
            "ml-1 flex min-w-0 items-center gap-1.5 leading-none",
            compact ? "text-[11px]" : "text-[13px]",
            inverse ? "text-white" : "text-zinc-900 dark:text-zinc-100",
          )}
        >
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide",
              compact ? "text-[9px]" : "text-[10px]",
              inverse ? "bg-white/15 text-white" : tokens.chip,
            )}
          >
            {category}
          </span>
          {icon ? (
            <span className="flex shrink-0 items-center" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 truncate font-semibold">{title}</span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 font-medium",
              compact ? "text-[10px]" : "text-[11px]",
              inverse ? "text-white/70" : "text-zinc-500 dark:text-zinc-400",
            )}
          >
            <Clock aria-hidden="true" className="h-3 w-3" />
            {formatDuration(durationMinutes)}
          </span>
        </div>
      )}
    </div>
  );
}
