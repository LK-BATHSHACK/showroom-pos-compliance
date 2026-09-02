import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import QuestionsAdmin from "@/components/QuestionsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminQuestionsPage() {
  const session = await requireRole(["Admin", "H&S"]);
  if (!session) redirect("/dashboard");

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Checklist Questions</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        Edit question text, options, whether it's required, and display order for the H&amp;S Check and POS Check
        forms - changes apply immediately, no code changes or deploy needed. Question numbers (Q1, Q2...) stay fixed
        even if you reorder, since actions/scoring reference them directly.
      </p>
      <QuestionsAdmin />
    </div>
  );
}
