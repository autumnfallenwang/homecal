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
 * still works fine over HTTP, and report failure to the caller instead of
 * swallowing it.
 */
export async function copyText(text: string): Promise<boolean> {
  // Preferred path — requires a secure context.
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — permission denied or blocked; try the legacy path.
    }
  }

  // Legacy path: a hidden textarea + execCommand. Deprecated, but it is the
  // only thing that works on a plain-HTTP origin.
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  // Keep it off-screen but still focusable — display:none would break select().
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}
