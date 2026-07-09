import { useEffect, useState } from "react";
import { CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  GRAPHQL_API_KEY_SCOPE_DESCRIPTIONS,
  GRAPHQL_API_KEY_SCOPE_LABELS,
  type GraphQLApiKeyScopeId,
} from "shared";
import { SettingsNav } from "@/components/SettingsNav";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatApiKeyLabel,
  scopeLabelForKey,
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
} from "@/features/api-keys/api";

const scopeOptions: GraphQLApiKeyScopeId[] = ["read", "write", "full"];

function formatCreatedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString();
}

export function ApiKeysPage() {
  const apiKeys = useApiKeys();
  const createKey = useCreateApiKey();
  const deleteKey = useDeleteApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<GraphQLApiKeyScopeId>("read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    document.title = "API keys | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }

    try {
      const result = await createKey.mutateAsync({ name: trimmed, scope });
      setCreateOpen(false);
      setName("");
      setScope("read");
      setCreatedKey(result.key);
      toast.success("API key created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create API key");
    }
  }

  async function copyCreatedKey(): Promise<void> {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function handleRevoke(): Promise<void> {
    if (!revokeTarget) return;
    try {
      await deleteKey.mutateAsync(revokeTarget.id);
      toast.success("API key revoked");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error("Could not revoke API key", { description: msg });
      throw e;
    }
  }

  const graphqlUrl =
    typeof window !== "undefined" ? `${window.location.origin}/graphql` : "/graphql";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage integrations and programmatic access to your bike data.
        </p>
      </div>

      <SettingsNav active="/settings/api-keys" />

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">API keys</h2>
        <p className="text-sm text-muted-foreground">
          Create keys for scripts or LLM tools to read your garage via GraphQL. Keys only work on
          the GraphQL endpoint, not other REST routes.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon className="size-4" />
              Your API keys
            </CardTitle>
            <CardDescription>
              Revoke a key immediately if it is exposed. You will only see the full secret once when
              a key is created.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Create API key
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {apiKeys.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading API keys…
            </div>
          ) : apiKeys.isError ? (
            <p className="text-sm text-destructive">
              {apiKeys.error instanceof Error ? apiKeys.error.message : "Failed to load API keys"}
            </p>
          ) : apiKeys.data?.length ? (
            apiKeys.data.map((key) => (
              <div
                key={key.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{key.name ?? "Unnamed key"}</span>
                    <Badge variant="secondary">{scopeLabelForKey(key)}</Badge>
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">
                    {formatApiKeyLabel(key)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Created {formatCreatedAt(key.createdAt)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start sm:self-center"
                  onClick={() =>
                    setRevokeTarget({ id: key.id, label: key.name ?? formatApiKeyLabel(key) })
                  }
                >
                  <Trash2Icon data-icon="inline-start" />
                  Revoke
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 border-t bg-muted/30">
          <p className="text-sm font-medium">Example request</p>
          <pre className="w-full overflow-x-auto rounded-md bg-background p-3 text-xs leading-relaxed">
            {`curl -s ${graphqlUrl} \\
  -H "Authorization: Bearer mbk_<your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ bikes { id name } }"}'`}
          </pre>
        </CardFooter>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Choose a name and permission level. The secret is shown only once after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="LLM garage reader"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="api-key-scope">Permissions</Label>
              <Select
                value={scope}
                onValueChange={(value) => setScope(value as GraphQLApiKeyScopeId)}
              >
                <SelectTrigger id="api-key-scope" className="w-full">
                  <SelectValue placeholder="Select permissions">
                    {GRAPHQL_API_KEY_SCOPE_LABELS[scope]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                  {scopeOptions.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      textValue={GRAPHQL_API_KEY_SCOPE_LABELS[option]}
                      className="items-start py-2.5"
                    >
                      <div className="flex flex-col items-start gap-0.5 pr-6">
                        <span className="font-medium">{GRAPHQL_API_KEY_SCOPE_LABELS[option]}</span>
                        <span className="text-xs leading-snug text-muted-foreground">
                          {GRAPHQL_API_KEY_SCOPE_DESCRIPTIONS[option]}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {GRAPHQL_API_KEY_SCOPE_DESCRIPTIONS[scope]}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={createKey.isPending}>
              {createKey.isPending ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" data-icon="inline-start" />
                  Creating…
                </>
              ) : (
                "Create key"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createdKey !== null} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>
              Copy this key now. You will not be able to see it again after closing this dialog.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="created-api-key">API key</Label>
            <div className="flex gap-2">
              <Input id="created-api-key" readOnly value={createdKey ?? ""} className="font-mono" />
              <Button type="button" variant="outline" onClick={() => void copyCreatedKey()}>
                <CopyIcon className="size-4" />
                <span className="sr-only">Copy</span>
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke API key?"
        description={
          revokeTarget
            ? `“${revokeTarget.label}” will stop working immediately. Any tools using it will need a new key.`
            : ""
        }
        confirmLabel="Revoke key"
        loading={deleteKey.isPending}
        loadingLabel="Revoking…"
        onConfirm={handleRevoke}
      />
    </div>
  );
}
