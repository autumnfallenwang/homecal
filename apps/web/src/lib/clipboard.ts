/**
 * Clipboard write with fallbacks for a plain-HTTP origin.
 *
 * `navigator.clipboard` only exists in a secure context — HTTPS or localhost.
 * HomeCal is served over plain HTTP on the LAN (http://homecal.arch.internal),
 * so on every real device the modern API is absent and a fallback is required.
 *
 * This matters most for the one-time API key reveal: a silent failure there
 * strands a key that is never shown again.
 *
 * Order, and why:
 *
 *  1. `navigator.clipboard.writeText` — secure contexts only.
 *  2. Select the *visible* key element and copy that selection. Preferred over
 *     a scratch textarea because the user can see the outcome: if the
 *     programmatic copy is refused — browsers differ, and Safari is strict
 *     about user gestures — the key is left highlighted on screen and
 *     Ctrl/Cmd+C just works.
 *  3. Off-screen textarea, hosted inside the nearest dialog. Radix traps
 *     focus, so a textarea appended to document.body has its focus pulled
 *     straight back and the selection is gone before the copy runs — measured
 *     in a live sheet, where activeElement became an input in the dialog.
 *
 * `execCommand("copy")` returns `true` even when it copied nothing (it did
 * exactly that in the broken case above), so its return value is never
 * trusted on its own.
 */

/** Highlights an element's text so the user can copy it by hand. */
export function selectElementText(el: HTMLElement | null): boolean {
  if (!el || typeof window === "undefined") return false;
  const sel = window.getSelection();
  if (!sel) return false;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
  return sel.toString().length > 0;
}

export async function copyText(text: string, el?: HTMLElement | null): Promise<boolean> {
  // 1. Secure-context API.
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or blocked — fall through.
    }
  }

  if (typeof document === "undefined") return false;

  // 2. Copy the visible element's own selection.
  if (el && selectElementText(el)) {
    try {
      if (document.execCommand("copy")) {
        const sel = window.getSelection();
        if (sel && sel.toString().trim() === text.trim()) return true;
      }
    } catch {
      // Fall through to the textarea.
    }
  }

  // 3. Off-screen textarea, inside the dialog so a focus trap can't steal it.
  // biome-ignore lint/security/noSecrets: CSS attribute selector, not a credential
  const host = el?.closest<HTMLElement>('[role="dialog"]') ?? el ?? document.body;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  host.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    const held = document.activeElement === ta && ta.selectionEnd - ta.selectionStart > 0;
    const copied = document.execCommand("copy");
    return held && copied;
  } catch {
    return false;
  } finally {
    host.removeChild(ta);
    // Leave the visible key highlighted either way — it is the manual escape
    // hatch, and re-selecting costs nothing.
    selectElementText(el ?? null);
  }
}
