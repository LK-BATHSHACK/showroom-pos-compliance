import { guardRole } from "@/lib/pageGuard";

// Store Manager added 31 Aug 2026 so they can fill out the in-tool POS
// Walkaround form for their own site - the "Upload File" tab stays
// Admin/Marketing-only (hidden client-side in page.tsx), since Store
// Managers don't handle Excel exports.
export default async function UploadLayout({ children }: { children: React.ReactNode }) {
  await guardRole(["Admin", "Marketing", "Store Manager"]);
  return <>{children}</>;
}
