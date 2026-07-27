import { useEffect } from "react";
import { Loader2Icon, ShieldIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { SettingsNav } from "@/components/SettingsNav";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { useAdminUsers, useAssignUserRole } from "./api";
import type { AdminUserGql, AdminUserRoleGql } from "@/lib/graphql/operations";

const roleOptions: AdminUserRoleGql[] = ["admin", "user"];

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function displayName(user: AdminUserGql): string {
  return user.name.trim() || "Unnamed user";
}

export function AdminUsersPage() {
  const users = useAdminUsers();
  const assignRole = useAssignUserRole();
  const pendingUserId = assignRole.isPending ? assignRole.variables?.userId : null;

  useEffect(() => {
    document.title = "Admin users | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  async function changeRole(user: AdminUserGql, role: AdminUserRoleGql): Promise<void> {
    if (user.role === role) return;
    try {
      await assignRole.mutateAsync({ userId: user.id, role });
      toast.success("User role updated", {
        description: `${displayName(user)} is now ${role}.`,
      });
    } catch (error) {
      toast.error("Could not update user role", {
        description: formatError(error, "Try again."),
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage integrations, programmatic access, and administrator-only runtime settings.
        </p>
      </div>

      <SettingsNav active="/settings/admin/users" />

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Admin users</h2>
        <p className="text-sm text-muted-foreground">
          Assign the simple Phase 1 roles used by the admin GraphQL API.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon />
            Users
          </CardTitle>
          <CardDescription>
            Role changes are saved on selection and refetched from the server.
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
          ) : users.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((user) => {
                  const rowPending = pendingUserId === user.id;
                  return (
                    <TableRow key={user.id} className={cn(rowPending && "opacity-60")}>
                      <TableCell className="font-medium">{displayName(user)}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={user.role}
                            disabled={rowPending}
                            onValueChange={(role) =>
                              void changeRole(user, role as AdminUserRoleGql)
                            }
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
                          {rowPending ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2Icon className="animate-spin" />
                              Saving…
                            </span>
                          ) : user.role === "admin" ? (
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
    </div>
  );
}
