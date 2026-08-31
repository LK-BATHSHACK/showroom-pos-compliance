import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchHSQuestions, fetchSites, scopeQuestionsForSite } from "@/lib/hsSubmission";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "Missing siteId." }, { status: 400 });

  const [sites, questions] = await Promise.all([fetchSites(), fetchHSQuestions()]);
  const site = sites.find((s) => s.id === siteId);
  if (!site) return NextResponse.json({ error: "Unknown site." }, { status: 404 });

  const scoped = scopeQuestionsForSite(questions, site);
  return NextResponse.json({ site, questions: scoped });
}
