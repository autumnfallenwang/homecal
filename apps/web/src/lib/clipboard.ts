/**
 * Clipboard write with an HTTP fallback.
 *
 * `navigator.clipboard` is only defined in a secure context — HTTPS or
 * localhost. HomeCal is served over plain HTTP on the LAN
 * (http://homecal.arch.internal), so on every device except a local dev box
 * the modern API is simply absent and any call to it throws.
 *
 * That matters most for the one-time API key reveal: if the copy silently
 * fails there, the key is unrecoverable and the service account has to be
 * re-keyed. So fall back to the legacy `execCommand("copy")` path, which
 * still works over HTTP, and report failure to the caller.
 *
 * Two traps in that fallback, both measured in a real Radix sheet:
 *
 *  1. The scratch <textarea> must live INSIDE the dialog. Radix traps focus,
 *     so a textarea appended to document.body has its focus pulled straight
 *     back (activeElement becomes an input in the dialog) and the selection
 *     is lost before the copy runs. Hence the `container` argument.
 *  2. `execCommand("copy")` returns `true` even when it copied nothing —
 *     it returned true in exactly the broken case above. So its return value
 *     alone is not proof; verify the textarea actually holds focus and a
 *     non-empty selection before believing it.
 */
export async function copyText(text: string, container?: HTMLElement | null): Promise<boolean> {
  // Preferred path — requires a secure context.
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — permission denied or blocked; try the legacy path.
    }
  }

  if (typeof document === "undefined") return false;

  // Prefer the nearest dialog so a focus trap can't steal the selection.
  // biome-ignore lint/security/noSecrets: CSS attribute selector, not a credential
  const host = container?.closest<HTMLElement>('[role="dialog"]') ?? container ?? document.body;

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  // Off-screen but focusable — display:none or visibility:hidden break select().
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
  }
}
