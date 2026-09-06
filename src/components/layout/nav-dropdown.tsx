"use client";

import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface NavDropdownItem {
  id: number;
  name: string;
}

interface NavDropdownProps {
  items: NavDropdownItem[];
  selectedId: number | null;
  emptyLabel: string;
  createPlaceholder: string;
  creating: boolean;
  newName: string;
  onNewNameChange: (value: string) => void;
  onCreate: (e: React.FormEvent) => void;
  onSelect: (id: number) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  width?: string;
}

/**
 * The list dropdown shared by the Watchlists, Portfolios and Screens tabs:
 * a create form over a selectable list with inline rename and delete.
 */
export function NavDropdown({
  items,
  selectedId,
  emptyLabel,
  createPlaceholder,
  creating,
  newName,
  onNewNameChange,
  onCreate,
  onSelect,
  onRename,
  onDelete,
  width = "w-72",
}: NavDropdownProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const stopEditing = () => {
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div
      className={`absolute top-full left-0 mt-1 ${width} overflow-hidden rounded-md border border-border bg-popover shadow-md z-50`}
    >
      <div className="border-b border-border p-2">
        <form onSubmit={onCreate} className="flex gap-2">
          <Input
            placeholder={createPlaceholder}
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={creating}>
            Add
          </Button>
        </form>
      </div>
      <div className="max-h-64 overflow-auto py-1">
        {items.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((item) => {
            const isSelected = item.id === selectedId;
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className="group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-accent"
                onClick={() => {
                  if (!isEditing) onSelect(item.id);
                }}
              >
                {isEditing ? (
                  <form
                    className="mr-2 flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onRename(item.id, editingName);
                      stopEditing();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-7 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") stopEditing();
                      }}
                    />
                    <Button type="submit" size="sm" variant="outline" className="h-7 px-2">
                      Save
                    </Button>
                  </form>
                ) : (
                  <>
                    <span
                      className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${
                        isSelected ? "font-medium text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <Check
                        className={`size-3.5 shrink-0 ${isSelected ? "text-primary" : "invisible"}`}
                      />
                      {item.name}
                    </span>
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label={`Rename ${item.name}`}
                        className="rounded p-1 text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(item.id);
                          setEditingName(item.name);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${item.name}`}
                        className="rounded p-1 text-subtle-foreground transition-colors hover:bg-negative/10 hover:text-negative"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(item.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
