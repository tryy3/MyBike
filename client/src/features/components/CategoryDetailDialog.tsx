import type { Component } from "shared";
import { categoryLabel } from "shared";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryDetailContent, type CategoryFormMode } from "./CategoryDetailContent";

interface CategoryDetailDialogProps {
  bikeId: string;
  open: boolean;
  categoryId: string | null;
  componentsByCategory: Map<string, Component[]>;
  formMode: CategoryFormMode;
  onFormModeChange: (mode: CategoryFormMode) => void;
  onOpenChange: (open: boolean) => void;
}

export function CategoryDetailDialog({
  bikeId,
  open,
  categoryId,
  componentsByCategory,
  formMode,
  onFormModeChange,
  onOpenChange,
}: CategoryDetailDialogProps) {
  if (!categoryId) return null;

  const label = categoryLabel(categoryId);
  const components = componentsByCategory.get(categoryId) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-4 pt-4 pb-3">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>View parts, swap alternates, or add components.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <CategoryDetailContent
            bikeId={bikeId}
            categoryId={categoryId}
            label={label}
            components={components}
            formMode={formMode}
            onFormModeChange={onFormModeChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
