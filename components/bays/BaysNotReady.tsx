"use client";
// Shown instead of the bay pages when the bay register isn't connected yet, or
// when something fails while loading (Round 30).
import Link from "next/link";
import { btn, btnQuiet, card, muted } from "./ui";

export default function BaysNotReady({ reason, onRetry }: { reason: "setup" | "error"; onRetry?: () => void }) {
  return (
    <div style={{ ...card, maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>{reason === "setup" ? "Bays aren't switched on yet" : "The bays page couldn't load"}</h1>
      <p style={{ ...muted, fontSize: 15, lineHeight: 1.5 }}>
        {reason === "setup"
          ? "The bay register is being set up and will appear here once it's connected. Everything else in the hub works as normal."
          : "Something went wrong loading the bay register. Please try again in a minute. If it keeps happening, let Lorraine know. Everything else in the hub works as normal."}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {onRetry && (
          <button type="button" onClick={onRetry} style={btn}>
            Try again
          </button>
        )}
        <Link href="/" style={btnQuiet}>
          Back to the hub
        </Link>
      </div>
    </div>
  );
}
