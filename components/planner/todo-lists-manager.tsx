"use client";

import { CirclePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { todoListColorTokens } from "@/lib/colors";
import type { TodoList, TodoListColor } from "@/lib/schema";
import { cn } from "@/lib/utils";

const COLOR_PALETTE: TodoListColor[] = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
  "zinc",
];

export function TodoListsManager({
  todoLists,
  isAddingList,
  name,
  color,
  onNameChange,
  onColorChange,
  onAddStart,
  onCancel,
  onSubmit,
  onDelete,
}: {
  todoLists: TodoList[];
  isAddingList: boolean;
  name: string;
  color: TodoListColor;
  onNameChange: (value: string) => void;
  onColorChange: (value: TodoListColor) => void;
  onAddStart: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onDelete: (listId: string) => void;
}) {
  return (
    <div className="mt-3 rounded-[var(--r)] border border-[color:var(--line-soft)] bg-[color:var(--sunken)] p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          Sublists
        </div>
        <button
          type="button"
          className="rounded p-1 text-[color:var(--ink-3)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          title="Add list"
          aria-label="Add list"
          onClick={onAddStart}
        >
          <CirclePlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {todoLists.map((list) => {
          const styles = todoListColorTokens(list.color);
          return (
            <div
              key={list.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
                styles.block,
                styles.text,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", styles.accent)} />
              {list.name}
              {!list.built_in && (
                <button
                  type="button"
                  className="ml-0.5 text-[color:var(--ink-3)] hover:text-[oklch(55%_0.18_25)]"
                  title={`Delete ${list.name}`}
                  aria-label={`Delete ${list.name}`}
                  onClick={() => onDelete(list.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {isAddingList && (
        <div className="mt-2 space-y-2 rounded-[var(--r-sm)] bg-[color:var(--card)] p-2">
          <input
            className="w-full rounded-md border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
            placeholder="List name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {COLOR_PALETTE.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "h-5 w-5 rounded-full ring-offset-2",
                    todoListColorTokens(item).accent,
                    color === item && "ring-2 ring-[color:var(--ink-3)]",
                  )}
                  title={item}
                  aria-label={item}
                  onClick={() => onColorChange(item)}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!name.trim()}
                onClick={onSubmit}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
