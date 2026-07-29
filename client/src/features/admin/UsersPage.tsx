import { useEffect, useState } from "react";
import { Loader2Icon, SaveIcon, ShieldIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { SettingsLayout } from "@/components/SettingsLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth-client";
import type { AdminUserGql, AdminUserRoleGql } from "@/lib/graphql/operations";
import { useAdminUsers, useAssignUserRole } from "./api";
import {
  applyRoleDraft,
  dirtyRoleAssignments,
  effectiveRole,
  reconcileRoleDrafts,
  type AdminRole,
} from "./users-role-draft";

const roleOptions: AdminUserRoleGql[] = ["admin", "user"];

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function displayName(user: AdminUserGql): string {
  return user.name?.trim() || "Unnamed user";
}

export function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const users = useAdminUsers();
  const assignRole = useAssignUserRole();
  const [drafts, setDrafts] = useState<Record<string, AdminRole>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    document.title = "Admin users | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  useEffect(() => {
    if (currentUserId == null) return;
    setDrafts((current) => {
      if (current[currentUserId] == null) return current;
      const next = { ...current };
      delete next[currentUserId];
      return next;
    });
  }, [currentUserId]);

  const serverUsers = users.data ?? [];
  const dirty =
    currentUserId == null ? [] : dirtyRoleAssignments(serverUsers, drafts, currentUserId);
  const dirtyCount = dirty.length;

  function setDraftRole(user: AdminUserGql, role: AdminUserRoleGql): void {
    if (currentUserId == null || user.id === currentUserId) return;
    setDrafts((current) => applyRoleDraft(current, user.id, user.role, role));
  }

  async function saveChanges(): Promise<void> {
    if (dirtyCount === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const results = await Promise.allSettled(dirty.map((entry) => assignRole.mutateAsync(entry)));
      const failed = results.find((r) => r.status === "rejected");
      const refetchResult = await users.refetch();
      const latest = refetchResult.data ?? serverUsers;
      setDrafts((current) => reconcileRoleDrafts(latest, current));

      if (failed) {
        const reason = failed.status === "rejected" ? failed.reason : null;
        toast.error("Could not update user roles", {
          description: formatError(reason, "Try again."),
        });
        return;
      }

      toast.success(dirtyCount === 1 ? "1 role change saved" : `${dirtyCount} role changes saved`);
    } catch (error) {
      toast.error("Could not update user roles", {
        description: formatError(error, "Try again."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SettingsLayout active="/settings/admin/users">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Admin users</h2>
          <p className="text-sm text-muted-foreground">
            Assign the simple Phase 1 roles used by the admin GraphQL API.
          </p>
        </div>
        <Button onClick={() => void saveChanges()} disabled={dirtyCount === 0 || isSaving}>
          {isSaving ? (
            <>
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <SaveIcon data-icon="inline-start" />
              Save{" "}
              {dirtyCount > 0 ? `${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "changes"}
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon />
            Users
          </CardTitle>
          <CardDescription>
            Change roles below, then save. Changes are not applied until you save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2Icon className="animate-spin" />
              Loading users…
            </div>
          ) : users.isError ? (
            <p className="py-4 text-sm text-destructive">
              {formatError(users.error, "Failed to load users")}
            </p>
          ) : serverUsers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serverUsers.map((user) => {
                  const isSelf = currentUserId != null && user.id === currentUserId;
                  const selectedRole = effectiveRole(user.id, user.role, drafts);
                  return (
                    <TableRow key={user.id} className={isSaving ? "opacity-60" : undefined}>
                      <TableCell className="font-medium">{displayName(user)}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isSelf ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <Select value={user.role} disabled>
                                    <SelectTrigger
                                      size="sm"
                                      className="w-32"
                                      aria-label={`Your role (${user.role}); cannot change your own role`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                  </Select>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>You cannot change your own role</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Select
                              value={selectedRole}
                              disabled={currentUserId == null || isSaving}
                              onValueChange={(role) => setDraftRole(user, role as AdminUserRoleGql)}
                            >
                              <SelectTrigger
                                size="sm"
                                className="w-32"
                                aria-label={`Role for ${displayName(user)}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {roleOptions.map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {role}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          )}
                          {user.role === "admin" ? (
                            <Badge variant="secondary">
                              <ShieldIcon data-icon="inline-start" />
                              Admin
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No users found.</p>
          )}
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}
