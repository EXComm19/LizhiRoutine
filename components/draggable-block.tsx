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
        "group relative cursor-grab select-none touch-none overflow-hidden rounded-[10px] border bg-[color:var(--card)] transition-all duration-150 active:cursor-grabbing",
        "hover:-translate-y-px hover:shadow-[0_4px_14px_-4px_rgba(20,18,10,0.16)]",
        compact ? "px-3 py-1.5" : "px-3.5 py-2.5",
        tokens.block,
        isDragging && "z-50 opacity-90 shadow-[0_8px_24px_-6px_rgba(20,18,10,0.22)]",
        disabled && "cursor-default active:cursor-default hover:translate-y-0",
        className,
      )}
      {...(!disabled ? listeners : undefined)}
      {...attributes}
      onDoubleClick={onDoubleClick}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[4px]",
          inverse ? "bg-white/70" : tokens.accent,
        )}
      />
      {children ?? (
        <div
          className={cn(
            "ml-1 flex min-w-0 items-center gap-2 leading-none",
            compact ? "text-[12px]" : "text-[13.5px]",
            inverse ? "text-white" : "text-[color:var(--ink)]",
          )}
        >
          <span
            className={cn(
              "shrink-0 inline-flex items-center h-4 px-1.5 rounded-[4px] font-[family-name:var(--font-mono)] font-semibold tracking-[0.04em]",
              compact ? "text-[9.5px]" : "text-[10px]",
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
          <span className="min-w-0 truncate font-semibold tracking-[-0.01em]">
            {title}
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 font-[family-name:var(--font-mono)] tracking-[0.03em]",
              compact ? "text-[10px]" : "text-[10.5px]",
              inverse ? "text-white/70" : "text-[color:var(--ink-3)]",
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
