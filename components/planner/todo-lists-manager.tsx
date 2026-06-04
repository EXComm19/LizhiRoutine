"use client";

import { CirclePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LifeAreaSelect } from "@/components/planner/LifeAreaSelect";
import { todoListColorTokens } from "@/lib/colors";
import { LIFE_AREA_LABELS } from "@/lib/life-area";
import { guessLifeArea } from "@/lib/life-area";
import type { LifeArea, TodoList, TodoListColor } from "@/lib/schema";
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
  lifeArea,
  onNameChange,
  onColorChange,
  onLifeAreaChange,
  onAddStart,
  onCancel,
  onSubmit,
  onDelete,
  onUpdateList,
}: {
  todoLists: TodoList[];
  isAddingList: boolean;
  name: string;
  color: TodoListColor;
  /** Life area for the new-list form. */
  lifeArea: LifeArea;
  onNameChange: (value: string) => void;
  onColorChange: (value: TodoListColor) => void;
  onLifeAreaChange: (value: LifeArea) => void;
  onAddStart: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onDelete: (listId: string) => void;
  /** Persist a life-area change on an existing list. */
  onUpdateList: (list: TodoList, patch: Partial<TodoList>) => void;
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
      <div className="flex flex-col gap-1.5">
        {todoLists.map((list) => {
          const styles = todoListColorTokens(list.color);
          const area = list.life_area ?? guessLifeArea(list.name);
          return (
            <div
              key={list.id}
              className="flex items-center gap-2 rounded-md bg-[color:var(--card)] px-2 py-1.5"
            >
              <span
                className={cn(
                  "inline-flex min-w-0 flex-1 items-center gap-1.5 truncate text-[12px] font-medium",
                  styles.text,
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", styles.accent)}
                />
                <span className="truncate">{list.name}</span>
              </span>
              <LifeAreaSelect
                value={area}
                onChange={(next) => onUpdateList(list, { life_area: next })}
                aria-label={`Life area for ${list.name}`}
                className="shrink-0"
              />
              {!list.built_in && (
                <button
                  type="button"
                  className="shrink-0 text-[color:var(--ink-3)] hover:text-[oklch(55%_0.18_25)]"
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
            <LifeAreaSelect
              value={lifeArea}
              onChange={onLifeAreaChange}
              aria-label="Life area for new list"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-[color:var(--ink-3)]">
              Area: {LIFE_AREA_LABELS[lifeArea]} (todos inherit this)
            </span>
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
