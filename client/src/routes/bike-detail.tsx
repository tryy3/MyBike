import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  DownloadIcon,
  PencilIcon,
  SheetIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { CATEGORIES } from "shared";
import type { Component } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BikeForm } from "@/features/bikes/BikeForm";
import { useBike, useDeleteBike } from "@/features/bikes/api";
import { ComponentsSplitView } from "@/features/components/ComponentsSplitView";
import { ImportComponentsDialog } from "@/features/components/ImportComponentsDialog";
import { buildTemplateCsv, downloadCsv } from "@/features/components/csv";
import { api } from "@/lib/api";

interface BikeDetailPageProps {
  bikeId: string;
}

function groupByCategory(components: Component[]): Map<string, Component[]> {
  const map = new Map<string, Component[]>();
  for (const c of components) {
    const list = map.get(c.category);
    if (list) list.push(c);
    else map.set(c.category, [c]);
  }
  return map;
}

export function BikeDetailPage({ bikeId }: BikeDetailPageProps) {
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useBike(bikeId);
  const deleteBike = useDeleteBike();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);

  useEffect(() => {
    if (data?.name) {
      document.title = `${data.name} | MyBike`;
    }
    return () => {
      document.title = "MyBike";
    };
  }, [data?.name]);

  function handleDownloadTemplate(): void {
    downloadCsv("mybike-components-template.csv", buildTemplateCsv());
    toast.message("Template downloaded", {
      description: "Fill in rows and import here. Leave id empty for new parts.",
    });
  }

  if (isPending) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
          Loading bike…
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="text-sm text-destructive">
            Could not load this bike: {error?.message ?? "Not found"}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">Back to bikes</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByCategory(data.components);
  const categoriesUsed = grouped.size;
  const activeCount = data.components.filter((c) => c.isActive).length;
  const emptyCategoryCount = CATEGORIES.length - categoriesUsed;

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-max text-muted-foreground">
        <Link to="/">
          <ArrowLeftIcon /> Back to bikes
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold text-balance">{data.name}</h1>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {[data.brand, data.model, data.year].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Edit bike"
                onClick={() => setEditing(true)}
              >
                <PencilIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete bike"
                onClick={() => setDeleting(true)}
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
        </CardHeader>
        {data.notes && (
          <CardContent>
            <Separator className="mb-4" />
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
          </CardContent>
        )}
      </Card>

      <Tabs defaultValue="components">
        <TabsList>
          <TabsTrigger value="components">
            Components
            <Badge variant="secondary" className="ml-2">
              {data.components.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="flex flex-col gap-4">
          {data.components.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No components yet. Add parts to any of the categories below — they are always
              available.
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {data.components.length} component
              {data.components.length === 1 ? "" : "s"} across {categoriesUsed} categor
              {categoriesUsed === 1 ? "y" : "ies"}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <UploadIcon />
              Import CSV
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={api.exportComponentsUrl(bikeId)} download>
                <DownloadIcon />
                Export CSV
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownloadTemplate}>
              <SheetIcon />
              Template
            </Button>
            {emptyCategoryCount > 0 && categoriesUsed > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowEmptyCategories((v) => !v)}>
                {showEmptyCategories
                  ? "Hide empty categories"
                  : `Show empty categories (${emptyCategoryCount})`}
              </Button>
            )}
          </div>
          <ComponentsSplitView
            bikeId={bikeId}
            components={data.components}
            showEmptyCategories={showEmptyCategories}
            categoriesUsed={categoriesUsed}
          />
        </TabsContent>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bike overview</CardTitle>
              <CardDescription>Snapshot of {data.name} and its setup.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <OverviewRow label="Total components">{data.components.length}</OverviewRow>
              <OverviewRow label="Categories used">{categoriesUsed}</OverviewRow>
              <OverviewRow label="Active components">{activeCount}</OverviewRow>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit bike dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit bike</DialogTitle>
            <DialogDescription>Update this bike's details.</DialogDescription>
          </DialogHeader>
          <BikeForm bike={data} bikeId={data.id} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete bike dialog */}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete bike?"
        description={`"${data.name}" and all of its components will be permanently deleted.`}
        confirmLabel="Delete bike"
        loading={deleteBike.isPending}
        loadingLabel="Deleting…"
        onConfirm={async () => {
          try {
            await deleteBike.mutateAsync(data.id);
            toast.success("Bike deleted");
            await navigate({ to: "/" });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Something went wrong";
            toast.error("Could not delete bike", { description: msg });
            throw e;
          }
        }}
      />

      {/* Import components from CSV (upload + confirmation gate). */}
      <ImportComponentsDialog bikeId={bikeId} open={importing} onOpenChange={setImporting} />
    </div>
  );
}

function OverviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}
