import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listRecords, createRecords, updateRecords, TABLES } from "@/lib/airtable";
import { isProtectedQuestion, EDITABLE_ANSWER_TYPES, type TemplateKey } from "@/lib/adminQuestions";

// Admin/H&S question editor - lets those two roles edit question text,
// options, Required and Order for both checklists at runtime, instead of
// text living in a hardcoded array (POS, until 2 Sep 2026) or only being
// changeable by editing Airtable directly (H&S) (Lorraine, 2 Sep 2026: "for
// admin login only pencil to edit the question and a button to add new
// question on both POS and H&S"). QuestionNumber (the "Q17" reference
// everything else - scoring, follow-up actions, this very page's own
// protected-question warnings - keys off) is deliberately NOT editable here;
// only OrderIndex (display order) is.

const TEMPLATE_NAMES: Record<TemplateKey, string> = {
  hs: "H&S Walkaround",
  pos: "POS Walkaround",
};

type TQFields = {
  QuestionText: string;
  Template?: string[];
  Section?: string;
  OrderIndex?: number;
  QuestionNumber?: number;
  AnswerType?: string;
  OptionsNotes?: string;
  Required?: boolean;
  ScopeType?: string;
};

function parseTemplateParam(v: string | null): TemplateKey | null {
  return v === "hs" || v === "pos" ? v : null;
}

export async function GET(req: NextRequest) {
  const session = await requireRole(["Admin", "H&S"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const template = parseTemplateParam(req.nextUrl.searchParams.get("template"));
  if (!template) return NextResponse.json({ error: "Missing/invalid template (must be hs or pos)." }, { status: 400 });

  const [templates, questions] = await Promise.all([
    listRecords<{ TemplateName: string }>(TABLES.CHECKLIST_TEMPLATES),
    listRecords<TQFields>(TABLES.TEMPLATE_QUESTIONS),
  ]);

  const tpl = templates.find((t) => t.fields.TemplateName === TEMPLATE_NAMES[template]);
  if (!tpl) return NextResponse.json({ error: `Checklist Template "${TEMPLATE_NAMES[template]}" not found.` }, { status: 404 });

  const rows = questions
    .filter((q) => q.fields.Template?.includes(tpl.id))
    .map((q) => {
      const qnum = q.fields.QuestionNumber ?? null;
      return {
        id: q.id,
        qnum,
        section: q.fields.Section || "",
        order: q.fields.OrderIndex ?? 0,
        text: q.fields.QuestionText,
        answerType: q.fields.AnswerType || "Short answer",
        optionsRaw: q.fields.OptionsNotes || "",
        required: !!q.fields.Required,
        protectedNote: isProtectedQuestion(template, qnum),
      };
    })
    .sort((a, b) => a.order - b.order);

  return NextResponse.json({ questions: rows, sections: Array.from(new Set(rows.map((r) => r.section))) });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["Admin", "H&S"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json();
  const template = parseTemplateParam(body.template);
  const text = String(body.text || "").trim();
  const section = String(body.section || "").trim();
  const answerType = String(body.answerType || "").trim();
  const optionsRaw = String(body.optionsRaw || "").trim();
  const required = !!body.required;

  if (!template) return NextResponse.json({ error: "Missing/invalid template (must be hs or pos)." }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Question text is required." }, { status: 400 });
  if (!section) return NextResponse.json({ error: "Section is required." }, { status: 400 });
  if (!(EDITABLE_ANSWER_TYPES as readonly string[]).includes(answerType)) {
    return NextResponse.json({ error: "Invalid answer type." }, { status: 400 });
  }

  const [templates, questions] = await Promise.all([
    listRecords<{ TemplateName: string }>(TABLES.CHECKLIST_TEMPLATES),
    listRecords<TQFields>(TABLES.TEMPLATE_QUESTIONS),
  ]);
  const tpl = templates.find((t) => t.fields.TemplateName === TEMPLATE_NAMES[template]);
  if (!tpl) return NextResponse.json({ error: `Checklist Template "${TEMPLATE_NAMES[template]}" not found.` }, { status: 404 });

  const existing = questions.filter((q) => q.fields.Template?.includes(tpl.id));
  const nextQnum = existing.reduce((max, q) => Math.max(max, q.fields.QuestionNumber || 0), 0) + 1;
  const nextOrder = existing.reduce((max, q) => Math.max(max, q.fields.OrderIndex || 0), 0) + 1;

  const fields: TQFields = {
    QuestionText: text,
    Template: [tpl.id],
    Section: section,
    OrderIndex: nextOrder,
    QuestionNumber: nextQnum,
    AnswerType: answerType,
    Required: required,
    ScopeType: "AllSites",
  };
  if (optionsRaw) fields.OptionsNotes = optionsRaw;

  const [created] = await createRecords<TQFields>(TABLES.TEMPLATE_QUESTIONS, [fields]);
  return NextResponse.json({ success: true, id: created.id, qnum: nextQnum, order: nextOrder });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(["Admin", "H&S"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  // Deliberately narrow: text, options, required, order only - AnswerType,
  // Section, QuestionNumber, Template and Scope aren't editable through this
  // endpoint (Lorraine, 2 Sep 2026 clarifying edit depth: "Text, options,
  // required, order").
  const fields: Partial<TQFields> = {};
  if (typeof body.text === "string") {
    const t = body.text.trim();
    if (!t) return NextResponse.json({ error: "Question text can't be blank." }, { status: 400 });
    fields.QuestionText = t;
  }
  if (typeof body.optionsRaw === "string") fields.OptionsNotes = body.optionsRaw.trim();
  if (typeof body.required === "boolean") fields.Required = body.required;
  if (typeof body.order === "number" && Number.isFinite(body.order)) fields.OrderIndex = body.order;

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await updateRecords<TQFields>(TABLES.TEMPLATE_QUESTIONS, [{ id, fields }]);
  return NextResponse.json({ success: true });
}
