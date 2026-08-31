import { guardRole } from "@/lib/pageGuard";

export default async function UploadLayout({ children }: { children: React.ReactNode }) {
  await guardRole(["Admin", "Marketing"]);
  return <>{children}</>;
}
