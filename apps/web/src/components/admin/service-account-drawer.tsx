"use client";

import { Check, Copy, KeyRound, Loader2, RotateCw, TerminalSquare, X } from "lucide-react";
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
import type { ServiceAccount, ServiceApiKey } from "@/hooks/use-service-accounts";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface ServiceAccountDrawerProps {
  service: ServiceAccount | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}

interface RevealedKey {
  id: string;
  name: string;
  plaintext: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "unused";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unused";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function expiresLabel(iso: string | null): { text: string; tone: "muted" | "warn" | "bad" } {
  if (!iso) return { text: "never expires", tone: "muted" };
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { text: "never expires", tone: "muted" };
  const diff = t - Date.now();
  if (diff <= 0) return { text: "expired", tone: "bad" };
  // Round up so a freshly-minted 30-day key reads "30d" not "29d" — creation
  // takes a few ms so flooring always shaves one off.
  const d = Math.ceil(diff / 86_400_000);
  if (d <= 0) {
    const h = Math.ceil(diff / 3_600_000);
    return { text: `expires in ${h}h`, tone: "warn" };
  }
  if (d < 7) return { text: `expires in ${d}d`, tone: "warn" };
  if (d < 60) return { text: `expires in ${d}d`, tone: "muted" };
  if (d < 365) return { text: `expires in ${Math.round(d / 30)}mo`, tone: "muted" };
  return { text: `expires in ${Math.round(d / 365)}y`, tone: "muted" };
}

function maskStart(key: ServiceApiKey): string {
  // Better Auth's `start` column already includes the configured prefix, so
  // don't re-prepend it — otherwise you get "hc_hc_GXP…".
  const start = key.start ?? key.prefix ?? "";
  return start ? `${start}…` : "…";
}

export function ServiceAccountDrawer({ service, onClose, onSaved }: ServiceAccountDrawerProps) {
  const isNew = service === "new";
  const open = service !== null;

  // Local snapshot — for the "just created" transition we build our own
  // ServiceAccount from the POST response so the drawer can stay open for
  // immediate first-key minting.
  const [localService, setLocalService] = useState<ServiceAccount | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Key operations
  const [keys, setKeys] = useState<ServiceApiKey[]>([]);
  const [minting, setMinting] = useState(false);
  const [mintName, setMintName] = useState("");
  const [showMintForm, setShowMintForm] = useState(false);
  // Expiry preset: "never" | "1" | "10" | "30" | "365" | "custom"
  const [mintExpiry, setMintExpiry] = useState<string>("never");
  const [mintExpiryCustom, setMintExpiryCustom] = useState<string>("");
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Danger zone
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const existing = !isNew && service !== null ? (localService ?? service) : localService;

  const resetForm = useCallback(() => {
    if (existing) {
      setName(existing.user.name);
      setColor(existing.user.color);
      setIsAdmin(existing.user.role === "admin");
      setIsActive(existing.user.banned !== true);
      setKeys(existing.keys);
    } else {
      setName("");
      setColor("#6b7280");
      setIsAdmin(false);
      setIsActive(true);
      setKeys([]);
    }
    setRevealed(null);
    setCopied(false);
    setShowMintForm(false);
    setMintName("");
    setMintExpiry("never");
    setMintExpiryCustom("");
    setError(null);
    setConfirmingDelete(false);
    setDeleteConfirmName("");
  }, [existing]);

  useEffect(() => {
    if (!open) {
      setLocalService(null);
      return;
    }
    resetForm();
  }, [open, resetForm]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const refetchKeys = useCallback(async () => {
    if (!existing) return;
    const res = await fetch(`/api/admin/api-keys?userId=${existing.user.id}`, {
      credentials: "include",
    });
    if (res.ok) setKeys((await res.json()) as ServiceApiKey[]);
  }, [existing]);

  const resolveExpiresInDays = (): number | undefined => {
    if (mintExpiry === "never") return undefined;
    if (mintExpiry === "custom") {
      const n = Number.parseInt(mintExpiryCustom, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    const n = Number.parseInt(mintExpiry, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const handleMint = async (e: FormEvent) => {
    e.preventDefault();
    if (!existing) return;
    if (mintExpiry === "custom") {
      const n = Number.parseInt(mintExpiryCustom, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setError("Enter a positive number of days");
        return;
      }
    }
    setMinting(true);
    setError(null);
    try {
      const reqBody: Record<string, unknown> = { name: mintName, userId: existing.user.id };
      const expiresInDays = resolveExpiresInDays();
      if (expiresInDays !== undefined) reqBody.expiresInDays = expiresInDays;
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error(`Mint failed (${res.status})`);
      const body = (await res.json()) as { id: string; name: string; key: string };
      setRevealed({ id: body.id, name: body.name, plaintext: body.key });
      setShowMintForm(false);
      setMintName("");
      await refetchKeys();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint failed");
    } finally {
      setMinting(false);
    }
  };

  const handleRotate = async (keyId: string) => {
    setBusyKeyId(keyId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/api-keys/${keyId}/rotate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Rotate failed (${res.status})`);
      const body = (await res.json()) as { id: string; name: string; key: string };
      setRevealed({ id: body.id, name: body.name, plaintext: body.key });
      await refetchKeys();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rotate failed");
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setBusyKeyId(keyId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Revoke failed (${res.status})`);
      await refetchKeys();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const res = await fetch("/api/admin/service-accounts", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color, role: isAdmin ? "admin" : "user" }),
        });
        if (!res.ok) throw new Error(`Create failed (${res.status})`);
        const body = (await res.json()) as {
          id: string;
          name: string;
          role: string;
          color: string;
          createdAt: string;
        };
        // Transition in-place to edit mode for the just-created service.
        setLocalService({
          user: {
            id: body.id,
            name: body.name,
            role: body.role,
            banned: false,
            color: body.color,
            createdAt: body.createdAt,
          },
          keys: [],
        });
        onSaved();
      } else if (existing) {
        const userId = existing.user.id;
        const updates: Record<string, unknown> = {};
        if (name !== existing.user.name) updates.name = name;
        if (color !== existing.user.color) updates.color = color;
        if (Object.keys(updates).length > 0) {
          await authClient.admin.updateUser({ userId, data: updates });
        }
        if ((existing.user.role === "admin") !== isAdmin) {
          await authClient.admin.setRole({ userId, role: isAdmin ? "admin" : "user" });
        }
        const wasActive = existing.user.banned !== true;
        if (wasActive && !isActive) {
          await authClient.admin.banUser({
            userId,
            banReason: "Service account paused",
          });
        } else if (!wasActive && isActive) {
          await authClient.admin.unbanUser({ userId });
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
    if (deleteConfirmName !== existing.user.name) {
      setError("Name doesn't match");
      return;
    }
    setSaving(true);
    try {
      await authClient.admin.removeUser({ userId: existing.user.id });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const title = isNew && !existing ? "New service account" : (existing?.user.name ?? "");
  let submitLabel = isNew && !existing ? "Create service" : "Save changes";
  if (saving) submitLabel = "Saving…";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col overflow-y-auto p-0">
        <SheetHeader className="flex-row items-center gap-4 border-b border-rule p-6 pb-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-rule"
            style={{ color }}
            aria-hidden
          >
            <TerminalSquare className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{title || "New service"}</SheetTitle>
            <SheetDescription>
              {isNew && !existing
                ? "Give it a name and role. The API key comes next."
                : "Edit identity, role, status, and API keys."}
            </SheetDescription>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6 p-6">
          {/* ─── Identity ─── */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="sa-name"
                className="font-display text-xs italic tracking-wide text-muted-foreground"
              >
                Name
              </Label>
              <Input
                id="sa-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Grocery Bot"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-rule bg-paper-warm/50 p-3">
              <Label
                htmlFor="sa-color"
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
                  id="sa-color"
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
              <Label htmlFor="sa-admin" className="text-sm">
                Admin (can hit admin routes)
              </Label>
              <Switch id="sa-admin" checked={isAdmin} onCheckedChange={setIsAdmin} />
            </div>
            {existing && (
              <div className="flex items-center justify-between rounded-lg border border-rule p-3">
                <Label htmlFor="sa-active" className="text-sm">
                  {isActive ? "Active" : "Paused"}
                </Label>
                <Switch id="sa-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
          </section>

          {/* ─── API keys (edit mode only) ─── */}
          {existing && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xs italic uppercase tracking-widest text-muted-foreground">
                  API keys
                </h3>
                {!showMintForm && !revealed && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setShowMintForm(true)}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Mint key
                  </Button>
                )}
              </div>

              {/* Reveal-once card */}
              {revealed && (
                <div className="rounded-lg border border-accent/40 bg-accent-soft/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-display text-xs italic text-muted-foreground">
                      New key &ldquo;{revealed.name}&rdquo; — copy it now, it won&rsquo;t be shown
                      again
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => setRevealed(null)}
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <code className="truncate rounded bg-background px-2 py-1 font-mono text-xs">
                      {revealed.plaintext}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleCopy(revealed.plaintext)}
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
              )}

              {/* Mint form */}
              {showMintForm && (
                <div className="flex flex-col gap-2 rounded-lg border border-rule p-3">
                  <Label
                    htmlFor="sa-mint-name"
                    className="font-display text-xs italic tracking-wide text-muted-foreground"
                  >
                    Key name
                  </Label>
                  <Input
                    id="sa-mint-name"
                    value={mintName}
                    onChange={(e) => setMintName(e.target.value)}
                    placeholder="grocery-bot-prod"
                  />
                  <Label className="mt-2 font-display text-xs italic tracking-wide text-muted-foreground">
                    Expires
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { value: "1", label: "1 day" },
                        { value: "10", label: "10 days" },
                        { value: "30", label: "1 month" },
                        { value: "365", label: "1 year" },
                        { value: "custom", label: "custom" },
                        { value: "never", label: "never" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMintExpiry(opt.value)}
                        className={cn(
                          "rounded-full border px-3 py-1 font-display text-xs transition-colors",
                          mintExpiry === opt.value
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-rule text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {mintExpiry === "custom" && (
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={3650}
                        value={mintExpiryCustom}
                        onChange={(e) => setMintExpiryCustom(e.target.value)}
                        placeholder="days"
                        className="w-28"
                      />
                      <span className="font-display text-xs italic text-muted-foreground">
                        days (max 3650)
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleMint}
                      disabled={minting || !mintName}
                    >
                      {minting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Minting…
                        </>
                      ) : (
                        "Mint"
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowMintForm(false);
                        setMintName("");
                        setMintExpiry("never");
                        setMintExpiryCustom("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Key list */}
              {keys.length === 0 && !showMintForm && (
                <p className="font-display text-sm italic text-muted-foreground">
                  No keys yet — mint the first one.
                </p>
              )}
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{k.name ?? "unnamed"}</span>
                      {!k.enabled && (
                        <span className="font-display text-[10px] italic text-muted-foreground">
                          disabled
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                      <code>{maskStart(k)}</code>
                      <span>·</span>
                      <span>{k.requestCount} reqs</span>
                      <span>·</span>
                      <span className="font-display italic">{relativeTime(k.lastRequest)}</span>
                      <span>·</span>
                      {(() => {
                        const exp = expiresLabel(k.expiresAt);
                        return (
                          <span
                            className={cn(
                              "font-display italic",
                              exp.tone === "bad" && "text-destructive",
                              exp.tone === "warn" && "text-accent",
                            )}
                          >
                            {exp.text}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyKeyId === k.id}
                      onClick={() => handleRotate(k.id)}
                      title="Rotate"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={busyKeyId === k.id}
                      onClick={() => handleRevoke(k.id)}
                      title="Revoke"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* ─── Danger zone ─── */}
          {existing && (
            <section className="mt-2 flex flex-col gap-3 border-t border-rule pt-5">
              <h3 className="font-display text-xs italic uppercase tracking-widest text-destructive">
                Danger zone
              </h3>
              {confirmingDelete ? (
                <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-xs text-destructive">
                    Type <span className="font-semibold">{existing.user.name}</span> to confirm
                    removal. All API keys will be revoked.
                  </p>
                  <Input
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={existing.user.name}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={saving || deleteConfirmName !== existing.user.name}
                    >
                      Remove service account
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
                  Remove service account
                </Button>
              )}
            </section>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-auto flex justify-end gap-2 border-t border-rule pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {revealed ? "Done" : "Cancel"}
            </Button>
            <Button type="submit" disabled={saving} className="rounded-full px-5">
              {submitLabel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
