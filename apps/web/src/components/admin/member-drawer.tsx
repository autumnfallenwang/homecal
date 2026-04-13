"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { FamilyMember } from "./family-card";

interface MemberDrawerProps {
  member: FamilyMember | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}

interface SessionRow {
  id: string;
  device: string;
  ip: string | null;
  lastActive: string;
  current: boolean;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function MemberDrawer({ member, onClose, onSaved }: MemberDrawerProps) {
  const isNew = member === "new";
  const existing = !isNew && member !== null ? member : null;
  const open = member !== null;

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [color, setColor] = useState("#c2410c");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Temp password state
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Danger-zone confirm
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const resetForm = useCallback(() => {
    if (existing) {
      setName(existing.name);
      setEmail(existing.email);
      setColor(existing.color);
      setIsAdmin(existing.role === "admin");
      setIsActive(!existing.banned);
    } else {
      setName("");
      setEmail("");
      setColor("#c2410c");
      setIsAdmin(false);
      setIsActive(true);
    }
    setTempPassword(null);
    setCopied(false);
    setSessions([]);
    setError(null);
    setConfirmingDelete(false);
    setDeleteConfirmName("");
  }, [existing]);

  // Re-initialize whenever the member changes
  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  // Load sessions for existing members
  const loadSessions = useCallback(async () => {
    if (!existing) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${existing.id}/sessions`, {
        credentials: "include",
      });
      if (res.ok) {
        setSessions((await res.json()) as SessionRow[]);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [existing]);

  useEffect(() => {
    if (open && existing) void loadSessions();
  }, [open, existing, loadSessions]);

  const handleCopy = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore clipboard failures */
    }
  };

  const handleResetPassword = async () => {
    if (!existing) return;
    setPasswordBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${existing.id}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Reset failed (${res.status})`);
      const body = (await res.json()) as { password: string };
      setTempPassword(body.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!existing) return;
    setRevokingId(sessionId);
    try {
      await fetch(`/api/admin/users/${existing.id}/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadSessions();
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    if (!existing) return;
    await fetch(`/api/admin/users/${existing.id}/sessions`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadSessions();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        // Generate temp password via a reset on a freshly-created user.
        const tempBootstrap = `${Math.random().toString(36).slice(2)}Aa1`;
        const createRes = await authClient.admin.createUser({
          name,
          email,
          password: tempBootstrap,
          role: isAdmin ? "admin" : "user",
          data: { color },
        });
        if (createRes.error) throw new Error(createRes.error.message ?? "Create failed");

        // Now rotate to a proper readable temp password and surface it inline.
        const userId = createRes.data?.user?.id;
        if (userId) {
          const resetRes = await fetch(`/api/admin/users/${userId}/reset-password`, {
            method: "POST",
            credentials: "include",
          });
          if (resetRes.ok) {
            const body = (await resetRes.json()) as { password: string };
            setTempPassword(body.password);
          }
        }
        onSaved();
        // Don't close yet — let the admin copy the password.
      } else if (existing) {
        const updates: Record<string, unknown> = {};
        if (name !== existing.name) updates.name = name;
        if (email !== existing.email) updates.email = email;
        if (color !== existing.color) updates.color = color;
        if (Object.keys(updates).length > 0) {
          await authClient.admin.updateUser({ userId: existing.id, data: updates });
        }
        if ((existing.role === "admin") !== isAdmin) {
          await authClient.admin.setRole({
            userId: existing.id,
            role: isAdmin ? "admin" : "user",
          });
        }
        const wasActive = !existing.banned;
        if (wasActive && !isActive) {
          await authClient.admin.banUser({
            userId: existing.id,
            banReason: "Deactivated by admin",
          });
        } else if (!wasActive && isActive) {
          await authClient.admin.unbanUser({ userId: existing.id });
        }
        onSaved();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (deleteConfirmName !== existing.name) {
      setError("Name doesn't match");
      return;
    }
    setSaving(true);
    try {
      await authClient.admin.removeUser({ userId: existing.id });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const title = isNew ? "Invite a family member" : (existing?.name ?? "");

  let submitLabel = isNew ? "Invite" : "Save changes";
  if (saving) submitLabel = "Saving…";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col overflow-y-auto p-0">
        <SheetHeader className="flex-row items-center gap-4 border-b border-rule p-6 pb-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-xl text-white"
            style={{ backgroundColor: color }}
            aria-hidden
          >
            {initial(name || title)}
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{title || "New member"}</SheetTitle>
            <SheetDescription>
              {isNew
                ? "Pick a name, color, and role. A temp password will be generated."
                : "Edit identity, role, status, and sessions."}
            </SheetDescription>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 p-6">
          {/* ─── Identity ─── */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="mdrawer-name"
                className="font-display text-xs italic tracking-wide text-muted-foreground"
              >
                Name
              </Label>
              <Input
                id="mdrawer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="mdrawer-email"
                className="font-display text-xs italic tracking-wide text-muted-foreground"
              >
                Email
              </Label>
              <Input
                id="mdrawer-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-rule bg-paper-warm/50 p-3">
              <Label
                htmlFor="mdrawer-color"
                className="font-display text-xs italic tracking-wide text-muted-foreground"
              >
                Color
              </Label>
              <div className="flex items-center gap-3">
                <span
                  className="h-8 w-8 rounded-full ring-1 ring-rule"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <input
                  id="mdrawer-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-7 w-14 cursor-pointer rounded border border-rule bg-background"
                />
                <span className="tabular-nums text-[11px] text-muted-foreground">{color}</span>
              </div>
            </div>
          </section>

          {/* ─── Role & status ─── */}
          <section className="flex flex-col gap-3">
            <h3 className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
              Role &amp; status
            </h3>
            <div className="flex items-center justify-between rounded-lg border border-rule p-3">
              <Label htmlFor="mdrawer-admin" className="text-sm">
                Admin
              </Label>
              <Switch id="mdrawer-admin" checked={isAdmin} onCheckedChange={setIsAdmin} />
            </div>
            {!isNew && (
              <div className="flex items-center justify-between rounded-lg border border-rule p-3">
                <Label htmlFor="mdrawer-active" className="text-sm">
                  {isActive ? "Active" : "Paused"}
                </Label>
                <Switch id="mdrawer-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
          </section>

          {/* ─── Password reset (existing only) ─── */}
          {existing && (
            <section className="flex flex-col gap-3">
              <h3 className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
                Password
              </h3>
              {tempPassword ? (
                <div className="rounded-lg border border-accent/40 bg-accent-soft/30 p-3">
                  <div className="font-display text-xs italic text-muted-foreground">
                    New temp password — share it in person
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <code className="truncate rounded bg-background px-2 py-1 font-mono text-sm">
                      {tempPassword}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCopy}
                      className="rounded-full"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={handleResetPassword}
                  disabled={passwordBusy}
                >
                  {passwordBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Resetting…
                    </>
                  ) : (
                    "Reset password"
                  )}
                </Button>
              )}
            </section>
          )}

          {/* ─── Sessions (existing only) ─── */}
          {existing && (
            <section className="flex flex-col gap-3">
              <h3 className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
                Active sessions
              </h3>
              {sessionsLoading && (
                <div className="h-12 rounded-lg bg-muted motion-safe:animate-pulse" />
              )}
              {!sessionsLoading && sessions.length === 0 && (
                <p className="font-display text-sm italic text-muted-foreground">
                  No active sessions.
                </p>
              )}
              {!sessionsLoading && sessions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {s.device}
                          {s.current && (
                            <span className="ml-2 font-display text-[10px] italic text-accent">
                              this device
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {s.ip ?? "unknown ip"} · {relativeTime(s.lastActive)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={revokingId === s.id}
                        onClick={() => handleRevokeSession(s.id)}
                      >
                        {revokingId === s.id ? "…" : "Sign out"}
                      </Button>
                    </div>
                  ))}
                  {sessions.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start text-destructive hover:text-destructive"
                      onClick={handleRevokeAll}
                    >
                      Sign out everywhere
                    </Button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ─── Danger zone (existing only) ─── */}
          {existing && (
            <section className="mt-2 flex flex-col gap-3 border-t border-rule pt-5">
              <h3 className="font-display text-xs italic uppercase tracking-widest text-destructive">
                Danger zone
              </h3>
              {confirmingDelete ? (
                <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-xs text-destructive">
                    Type <span className="font-semibold">{existing.name}</span> to confirm removal.
                  </p>
                  <Input
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={existing.name}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={saving || deleteConfirmName !== existing.name}
                    >
                      Remove from family
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setConfirmingDelete(false);
                        setDeleteConfirmName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "self-start rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive",
                  )}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Remove from family
                </Button>
              )}
            </section>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-auto flex justify-end gap-2 border-t border-rule pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {tempPassword ? "Done" : "Cancel"}
            </Button>
            {!tempPassword && (
              <Button type="submit" disabled={saving} className="rounded-full px-5">
                {submitLabel}
              </Button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
