"use client";

import { Camera, FileText, Loader2, Mic, MicOff, Pencil, Plus, Sparkles } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface QuickAddPopoverProps {
  onSmartInput: (text: string) => Promise<boolean>;
  onImageInput: (image: string, mimeType: string) => Promise<boolean>;
  smartInputLoading: boolean;
  imageInputLoading: boolean;
  onNewEvent: () => void;
}

export function QuickAddPopover({
  onSmartInput,
  onImageInput,
  smartInputLoading,
  imageInputLoading,
  onNewEvent,
}: QuickAddPopoverProps) {
  const [open, setOpen] = useState(false);
  const [smartText, setSmartText] = useState("");
  const [listening, setListening] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = smartInputLoading || imageInputLoading;

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

    // Reset file input so same file can be re-selected
    e.target.value = "";

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    // Show preview
    setImagePreview(dataUrl);

    // Extract base64 and mime type
    const [header, base64] = dataUrl.split(",");
    const mimeType = header.match(/data:(.*?);/)?.[1] || "image/jpeg";

    const success = await onImageInput(base64, mimeType);
    setImagePreview(null);
    if (success) {
      setOpen(false);
    }
  }

  function handleManualCreate() {
    setOpen(false);
    onNewEvent();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <p className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Type or speak to add event
        </p>

        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={smartText}
            onChange={(e) => setSmartText(e.target.value)}
            onKeyDown={handleSmartKeyDown}
            placeholder="e.g. Dentist next Tue 2pm"
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleVoiceInput}
            disabled={isLoading || listening}
            title={listening ? "Listening..." : "Voice input"}
          >
            {listening ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSmartSubmit}
            disabled={isLoading || !smartText.trim()}
            title="Parse with AI"
          >
            {smartInputLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="mt-3 flex flex-col">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            onClick={handleImageClick}
            disabled={isLoading}
          >
            {imageInputLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {imageInputLoading ? "Parsing image..." : "Upload image / photo"}
          </button>

          {imagePreview && (
            <div className="mt-2 flex justify-center">
              {/* biome-ignore lint/a11y/useAltText: preview thumbnail */}
              {/* biome-ignore lint/performance/noImgElement: data URL preview, next/image not suitable */}
              <img src={imagePreview} className="max-h-32 rounded-md border object-contain" />
            </div>
          )}

          <button
            type="button"
            disabled
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground opacity-50"
          >
            <FileText className="h-4 w-4" />
            Import .ics file
          </button>
        </div>

        <div className="my-2 border-t" />

        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          onClick={handleManualCreate}
        >
          <Pencil className="h-4 w-4" />
          Or create manually
        </button>
      </PopoverContent>
    </Popover>
  );
}
