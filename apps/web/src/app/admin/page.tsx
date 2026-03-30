"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2 } from "lucide-react";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { authClient } from "@/lib/auth-client";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  color: string;
  createdAt: string;
}

export default function AdminPage() {
  const { session, isPending } = useAuthRedirect(true);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formColor, setFormColor] = useState("#3b82f6");
  const [formRole, setFormRole] = useState("user");
  const [formActive, setFormActive] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (!isPending && session && !isAdmin) {
      router.replace("/");
    }
  }, [isPending, session, isAdmin, router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [adminRes, membersRes] = await Promise.all([
        authClient.admin.listUsers({ query: { limit: 100 } }),
        fetch("/api/users", { credentials: "include" }).then((r) => r.json()),
      ]);
      if (adminRes.data) {
        const colorMap = new Map<string, string>();
        for (const m of membersRes as { id: string; color: string }[]) {
          colorMap.set(m.id, m.color);
        }
        setAllUsers(
          adminRes.data.users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role ?? "user",
            banned: u.banned ?? false,
            color: colorMap.get(u.id) ?? "#6b7280",
            createdAt: u.createdAt.toString(),
          })),
        );
      }
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin, fetchUsers]);

  const users = (
    search
      ? allUsers.filter((u) => {
          const q = search.toLowerCase();
          return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        })
      : allUsers
  ).sort((a, b) => {
    const selfId = session?.user?.id;
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    return a.name.localeCompare(b.name);
  });

  function openCreate() {
    setModalMode("create");
    setEditUserId(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormColor("#3b82f6");
    setFormRole("user");
    setFormActive(true);
    setFormError(null);
  }

  function openEdit(user: AdminUser) {
    setModalMode("edit");
    setEditUserId(user.id);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword("");
    setFormColor(user.color);
    setFormRole(user.role);
    setFormActive(!user.banned);
    setFormError(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditUserId(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSaving(true);

    try {
      if (modalMode === "create") {
        const res = await authClient.admin.createUser({
          name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
          data: { color: formColor },
        });
        if (res.error) throw new Error(res.error.message ?? "Failed to create user");
      } else if (modalMode === "edit" && editUserId) {
        const currentUser = allUsers.find((u) => u.id === editUserId);

        // Update name, email, color
        if (currentUser) {
          const updates: Record<string, unknown> = {};
          if (formName !== currentUser.name) updates.name = formName;
          if (formEmail !== currentUser.email) updates.email = formEmail;
          updates.color = formColor;
          if (Object.keys(updates).length > 0) {
            await authClient.admin.updateUser({ userId: editUserId, data: updates });
          }
        }

        // Update role if changed
        if (currentUser && currentUser.role !== formRole) {
          await authClient.admin.setRole({ userId: editUserId, role: formRole });
        }

        // Update ban status if changed
        if (currentUser) {
          const wasBanned = currentUser.banned;
          const shouldBan = !formActive;
          if (shouldBan && !wasBanned) {
            await authClient.admin.banUser({
              userId: editUserId,
              banReason: "Deactivated by admin",
            });
          } else if (!shouldBan && wasBanned) {
            await authClient.admin.unbanUser({ userId: editUserId });
          }
        }

        // Update password if provided
        if (formPassword) {
          await authClient.admin.setPassword({
            userId: editUserId,
            newPassword: formPassword,
          });
        }
      }

      closeModal();
      fetchUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(userId: string) {
    setError(null);
    try {
      await authClient.admin.removeUser({ userId });
      setConfirmingId(null);
      fetchUsers();
    } catch {
      setError("Failed to delete user");
    }
  }

  if (isPending || !session || !isAdmin) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin - User Management</h1>
        <Button variant="outline" onClick={() => router.push("/")}>
          Back to Calendar
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="mb-4 flex items-center gap-4">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button size="sm" onClick={openCreate}>
          Create User
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading users...</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {search ? "No users found" : "No users"}
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isSelf = user.id === session.user.id;
                  return (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: user.color }}
                          />
                          {user.name}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-2">
                        <span
                          className={
                            user.role === "admin"
                              ? "rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                              : "text-xs text-muted-foreground"
                          }
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {user.banned ? (
                          <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                            inactive
                          </span>
                        ) : (
                          <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                            active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground">You</span>
                        ) : confirmingId === user.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">Delete?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(user.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmingId(null)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(user)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setConfirmingId(user.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalMode !== null} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modalMode === "create" ? "Create User" : "Edit User"}</DialogTitle>
            <DialogDescription>
              {modalMode === "create"
                ? "Add a new family member."
                : "Update user details, role, status, or password."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {modalMode === "create" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-name">Name</Label>
                    <Input
                      id="form-name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-email">Email</Label>
                    <Input
                      id="form-email"
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-password">Password</Label>
                    <Input
                      id="form-password"
                      type="password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-color">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="form-color"
                        type="color"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded border"
                      />
                      <span className="text-sm text-muted-foreground">{formColor}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {modalMode === "edit" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-name-edit">Name</Label>
                    <Input
                      id="form-name-edit"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-email-edit">Email</Label>
                    <Input
                      id="form-email-edit"
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-password-edit">New Password</Label>
                    <Input
                      id="form-password-edit"
                      type="password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Leave blank to keep current"
                      minLength={8}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="form-color-edit">Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="form-color-edit"
                        type="color"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded border"
                      />
                      <span className="text-sm text-muted-foreground">{formColor}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <div className="flex items-center gap-2 pt-1.5">
                  <Switch
                    checked={formRole === "admin"}
                    onCheckedChange={(checked) => setFormRole(checked ? "admin" : "user")}
                  />
                  <span className="text-sm">{formRole === "admin" ? "Admin" : "User"}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <div className="flex items-center gap-2 pt-1.5">
                  <Switch checked={formActive} onCheckedChange={setFormActive} />
                  <span className="text-sm">{formActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={formSaving}>
                {formSaving ? "Saving..." : modalMode === "create" ? "Create" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
