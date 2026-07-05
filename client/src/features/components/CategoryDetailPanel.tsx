import type { Component } from "shared";
import { categoryLabel } from "shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CategoryDetailContent, type CategoryFormMode } from "./CategoryDetailContent";

interface CategoryDetailPanelProps {
  bikeId: string;
  selectedCategoryId: string | null;
  componentsByCategory: Map<string, Component[]>;
  formMode: CategoryFormMode;
  onFormModeChange: (mode: CategoryFormMode) => void;
  className?: string;
}

export function CategoryDetailPanel({
  bikeId,
  selectedCategoryId,
  componentsByCategory,
  formMode,
  onFormModeChange,
  className,
}: CategoryDetailPanelProps) {
  if (!selectedCategoryId) {
    return (
      <Card className={cn("lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]", className)}>
        <CardContent className="flex min-h-48 items-center justify-center p-6">
          <p className="text-center text-sm text-muted-foreground text-balance">
            Select a category to view parts, swap alternates, or add components.
          </p>
        </CardContent>
      </Card>
    );
  }

  const label = categoryLabel(selectedCategoryId);
  const components = componentsByCategory.get(selectedCategoryId) ?? [];

  return (
    <Card
      className={cn("lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto", className)}
    >
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <CategoryDetailContent
          bikeId={bikeId}
          categoryId={selectedCategoryId}
          label={label}
          components={components}
          formMode={formMode}
          onFormModeChange={onFormModeChange}
        />
      </CardContent>
    </Card>
  );
}
