"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { authClient } from "@/lib/auth-client";

export default function RegisterPage() {
  const { isPending: sessionPending } = useAuthRedirect(false);
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [color, setColor] = useState("#c2410c");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    void authClient.signUp
      .email({ name, email, password, color })
      .then((result) => {
        if (result.error) {
          setError(result.error.message ?? "Registration failed");
          setLoading(false);
        } else {
          router.push("/");
        }
      })
      .catch(() => {
        setError("An unexpected error occurred");
        setLoading(false);
      });
  }

  if (sessionPending) {
    return null;
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      {/* Hero column */}
      <section className="hidden flex-col justify-between p-12 lg:flex xl:p-16">
        <div className="font-display text-2xl italic">
          home<span className="not-italic font-medium">cal</span>
          <span className="text-accent">.</span>
        </div>
        <div>
          <h1 className="font-display text-6xl font-light leading-[0.95] tracking-tight xl:text-7xl">
            Make yourself
            <br />
            at home
            <span className="text-accent">,</span>
          </h1>
          <p className="mt-6 max-w-sm font-display text-xl italic text-muted-foreground">
            Pick a color, claim a name, and start collecting the days.
          </p>
        </div>
        <p className="font-display text-sm italic text-muted-foreground">
          One calendar. Every person you call family.
        </p>
      </section>

      {/* Form column */}
      <section className="flex min-h-screen flex-col items-center justify-center bg-card p-6 lg:p-12">
        {/* Mobile wordmark */}
        <div className="mb-6 font-display text-xl italic lg:hidden">
          home<span className="not-italic font-medium">cal</span>
          <span className="text-accent">.</span>
        </div>

        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-light tracking-tight">
            Create an account
            <span className="text-accent">.</span>
          </h2>
          <p className="mt-1 font-display text-base italic text-muted-foreground">
            Start with just your name.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="name"
                className="font-display text-xs italic tracking-wide text-muted-foreground"
              >
                Name
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="email"
                className="font-display text-xs italic tracking-wide text-muted-foreground"
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="password"
                className="font-display text-xs italic tracking-wide text-muted-foreground"
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label
                htmlFor="color"
                className="font-display text-xs italic tracking-wide text-muted-foreground"
              >
                Your color
              </Label>
              <div className="flex items-center gap-2">
                <input
                  id="color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border border-rule bg-background"
                />
                <span className="tabular-nums text-xs text-muted-foreground">{color}</span>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="mt-2 h-11 w-full rounded-full">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center font-display text-sm italic text-muted-foreground">
            Already have a family?{" "}
            <Link
              href="/login"
              className="not-italic font-sans font-medium text-foreground underline decoration-accent decoration-2 underline-offset-4 transition-colors hover:text-accent"
            >
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
