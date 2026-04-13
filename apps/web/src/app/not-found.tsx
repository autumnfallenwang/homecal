import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-2 font-display text-xl italic">
          home<span className="not-italic font-medium">cal</span>
          <span className="text-accent">.</span>
        </div>

        <svg
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mt-6 text-accent/70"
          aria-hidden
        >
          <title>Compass</title>
          <circle cx="48" cy="48" r="36" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="48" cy="48" r="2.5" fill="currentColor" />
          {/* N/E/S/W ticks */}
          <line
            x1="48"
            y1="12"
            x2="48"
            y2="18"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="48"
            y1="78"
            x2="48"
            y2="84"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="12"
            y1="48"
            x2="18"
            y2="48"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="78"
            y1="48"
            x2="84"
            y2="48"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Needle pointing NE */}
          <path d="M 48 48 L 66 30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M 48 48 L 36 60"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>

        <h1 className="mt-6 font-display text-4xl font-light leading-tight tracking-tight">
          Lost in the calendar
          <span className="text-accent">.</span>
        </h1>
        <p className="mt-3 font-display text-base italic text-muted-foreground">
          This page isn't on the books.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-full bg-accent px-6 font-display text-sm italic text-accent-foreground transition-all hover:brightness-110"
        >
          Back to today →
        </Link>
      </div>
    </div>
  );
}
