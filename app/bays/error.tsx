"use client";
// Round 30: any error inside the bay pages stays inside the bay pages, with a
// readable message, instead of the hub-wide "Application error" screen.
import BaysNotReady from "@/components/bays/BaysNotReady";

export default function BaysError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <BaysNotReady reason="error" onRetry={reset} />;
}
