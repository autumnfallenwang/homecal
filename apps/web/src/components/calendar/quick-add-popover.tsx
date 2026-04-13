"use client";

import { Camera, FileText, Loader2, Mic, Plus, Sparkles } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface IcsImportResult {
  imported: number;
  skipped: number;
}

interface QuickAddPopoverProps {
  onSmartInput: (text: string) => Promise<boolean>;
  onImageInput: (image: string, mimeType: string) => Promise<boolean>;
  onIcsImport: (icsData: string) => Promise<IcsImportResult>;
  smartInputLoading: boolean;
  imageInputLoading: boolean;
  onNewEvent: () => void;
}

function Equalizer() {
  return (
    <span aria-hidden className="inline-flex h-4 items-end gap-[2px] text-current">
      <span
        className="eq-bar-a block h-full w-[2.5px] origin-bottom rounded-sm bg-current"
        style={{ transform: "scaleY(0.4)" }}
      />
      <span
        className="eq-bar-b block h-full w-[2.5px] origin-bottom rounded-sm bg-current"
        style={{ transform: "scaleY(0.9)" }}
      />
      <span
        className="eq-bar-c block h-full w-[2.5px] origin-bottom rounded-sm bg-current"
        style={{ transform: "scaleY(0.6)" }}
      />
    </span>
  );
}

interface ModeButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ModeButton({ label, active, disabled, onClick, children }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all disabled:opacity-40",
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-rule bg-background text-foreground hover:border-accent hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}

function ParsingSkeleton() {
  return (
    <div className="space-y-2.5 motion-safe:animate-pulse">
      <Skeleton className="h-5 w-48 rounded-sm" />
      <Skeleton className="h-3 w-28 rounded-sm" />
      <div className="flex gap-1.5 pt-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function QuickAddPopover({
  onSmartInput,
  onImageInput,
  onIcsImport,
  smartInputLoading,
  imageInputLoading,
  onNewEvent,
}: QuickAddPopoverProps) {
  const [open, setOpen] = useState(false);
  const [smartText, setSmartText] = useState("");
  const [listening, setListening] = useState(false);
  const [icsLoading, setIcsLoading] = useState(false);
  const [icsResult, setIcsResult] = useState<IcsImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const icsInputRef = useRef<HTMLInputElement>(null);
  const smartInputRef = useRef<HTMLInputElement>(null);

  // Focus the text input when the popover opens (replaces autoFocus — flagged by a11y lint)
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => smartInputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  const parsing = smartInputLoading || imageInputLoading;
  const isLoading = parsing || icsLoading;

  async function handleSmartSubmit() {
    const trimmed = smartText.trim();
    if (!trimmed) return;
    const success = await onSmartInput(trimmed);
    if (success) {
      setSmartText("");
      setOpen(false);
    }
  }

  function handleSmartKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSmartSubmit();
    }
  }

  function handleVoiceInput() {
    // biome-ignore lint/suspicious/noExplicitAny: Web Speech API not in all TS type libs
    const w = window as any;
    const SpeechRecognitionCtor = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSmartText("Voice input not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);

    recognition.onresult = async (event: { results: { 0: { 0: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      setSmartText(transcript);
      if (transcript.trim()) {
        const success = await onSmartInput(transcript.trim());
        if (success) {
          setSmartText("");
          setOpen(false);
        }
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.start();
  }

  function handleImageClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    const [header, base64] = dataUrl.split(",");
    const mimeType = header.match(/data:(.*?);/)?.[1] || "image/jpeg";

    const success = await onImageInput(base64, mimeType);
    if (success) {
      setOpen(false);
    }
  }

  function handleIcsClick() {
    icsInputRef.current?.click();
  }

  async function handleIcsSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(file);
    });

    setIcsLoading(true);
    try {
      const result = await onIcsImport(text);
      setIcsResult(result);
      setTimeout(() => {
        setIcsResult(null);
        setOpen(false);
      }, 2000);
    } catch {
      setIcsResult(null);
    } finally {
      setIcsLoading(false);
    }
  }

  function handleManualCreate() {
    setOpen(false);
    onNewEvent();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent pl-3.5 pr-4 text-sm font-medium text-accent-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Plus className="h-4 w-4" />
          <span>New event</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] rounded-2xl p-5 shadow-(--shadow-card)"
        align="end"
        sideOffset={10}
      >
        {parsing ? (
          <ParsingSkeleton />
        ) : (
          <input
            ref={smartInputRef}
            type="text"
            value={smartText}
            onChange={(e) => setSmartText(e.target.value)}
            onKeyDown={handleSmartKeyDown}
            placeholder="What's happening?"
            disabled={isLoading}
            className="w-full border-0 bg-transparent p-0 font-display text-2xl leading-tight tracking-tight text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
          />
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={handleFileSelect}
            />
            <input
              ref={icsInputRef}
              type="file"
              accept=".ics"
              className="hidden"
              onChange={handleIcsSelect}
            />

            <ModeButton
              label={listening ? "Listening..." : "Voice input"}
              onClick={handleVoiceInput}
              disabled={isLoading || listening}
              active={listening}
            >
              {listening ? <Equalizer /> : <Mic className="h-4 w-4" />}
            </ModeButton>

            <ModeButton
              label="Upload image"
              onClick={handleImageClick}
              disabled={isLoading}
              active={imageInputLoading}
            >
              {imageInputLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </ModeButton>

            <ModeButton
              label="Import .ics file"
              onClick={handleIcsClick}
              disabled={isLoading}
              active={icsLoading}
            >
              {icsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </ModeButton>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handleSmartSubmit}
            disabled={isLoading || !smartText.trim()}
            className="h-10 rounded-full px-4"
          >
            {smartInputLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" />
                Parse
              </>
            )}
          </Button>
        </div>

        {icsResult && (
          <p className="mt-3 font-display text-xs italic text-muted-foreground">
            Imported {icsResult.imported} event{icsResult.imported !== 1 ? "s" : ""}.
            {icsResult.skipped > 0 && ` ${icsResult.skipped} recurring skipped.`}
          </p>
        )}

        <div className="mt-5 border-t border-rule pt-3">
          <button
            type="button"
            className="font-display text-sm italic text-muted-foreground transition-colors hover:text-accent"
            onClick={handleManualCreate}
          >
            Or create manually →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
