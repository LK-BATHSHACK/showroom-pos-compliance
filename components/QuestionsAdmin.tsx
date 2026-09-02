"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { EDITABLE_ANSWER_TYPES, OPTIONS_ANSWER_TYPES } from "@/lib/adminQuestions";

type QuestionRow = {
  id: string;
  qnum: number | null;
  section: string;
  order: number;
  text: string;
  answerType: string;
  optionsRaw: string;
  required: boolean;
  protectedNote: string | null;
};

type TemplateKey = "hs" | "pos";

const TABS: { key: TemplateKey; label: string }[] = [
  { key: "hs", label: "H&S Check" },
  { key: "pos", label: "POS Check" },
];

export default function QuestionsAdmin() {
  const [template, setTemplate] = useState<TemplateKey>("hs");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ text: "", optionsRaw: "", required: false, order: 0 });
  const [saving, setSaving] = useState(false);

  const [addingSection, setAddingSection] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ text: "", answerType: "Short answer", optionsRaw: "", required: false, newSectionName: "" });
  const [addingNewSection, setAddingNewSection] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load(t: TemplateKey) {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/questions?template=${t}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Couldn't load questions.");
      setQuestions([]);
      setSections([]);
    } else {
      setQuestions(body.questions);
      setSections(body.sections);
    }
    setLoading(false);
  }

  useEffect(() => {
    load(template);
    setEditingId(null);
    setAddingSection(null);
    setAddingNewSection(false);
    setNotice("");
  }, [template]);

  const grouped = useMemo(() => {
    const map = new Map<string, QuestionRow[]>();
    questions.forEach((q) => {
      if (!map.has(q.section)) map.set(q.section, []);
      map.get(q.section)!.push(q);
    });
    return Array.from(map.entries());
  }, [questions]);

  function startEdit(q: QuestionRow) {
    setEditingId(q.id);
    setEditForm({ text: q.text, optionsRaw: q.optionsRaw, required: q.required, order: q.order });
    setNotice("");
    setError("");
  }

  async function saveEdit(q: QuestionRow) {
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: q.id,
        text: editForm.text,
        optionsRaw: OPTIONS_ANSWER_TYPES.has(q.answerType) ? editForm.optionsRaw : undefined,
        required: editForm.required,
        order: editForm.order,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Something went wrong saving that.");
      return;
    }
    setEditingId(null);
    setNotice(`Saved Q${q.qnum ?? "?"}.`);
    load(template);
  }

  function startAdd(section: string) {
    setAddingSection(section);
    setAddingNewSection(false);
    setAddForm({ text: "", answerType: "Short answer", optionsRaw: "", required: false, newSectionName: "" });
    setError("");
    setNotice("");
  }

  async function submitAdd() {
    const section = addingNewSection ? addForm.newSectionName.trim() : addingSection || "";
    if (!addForm.text.trim() || !section) {
      setError("Question text and section are both required.");
      return;
    }
    setCreating(true);
    setError("");
    const res = await fetch("/api/admin/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template,
        section,
        text: addForm.text,
        answerType: addForm.answerType,
        optionsRaw: OPTIONS_ANSWER_TYPES.has(addForm.answerType) ? addForm.optionsRaw : "",
        required: addForm.required,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(body.error || "Something went wrong adding that question.");
      return;
    }
    setNotice(`Added as Q${body.qnum} - it'll appear at the end of ${section} on the live form.`);
    setAddingSection(null);
    setAddingNewSection(false);
    load(template);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #eee" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTemplate(t.key)}
            style={{
              background: "none",
              border: "none",
              borderBottom: template === t.key ? "2px solid #E6017E" : "2px solid transparent",
              color: template === t.key ? "#E6017E" : "#6E6E6E",
              fontWeight: template === t.key ? 600 : 500,
              fontSize: 14,
              padding: "10px 16px",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div style={{ background: "#EAF7EA", color: "#1a7a1a", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ background: "#FBEAEA", color: "#a01c1c", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#6E6E6E" }}>Loading...</p>
      ) : (
        <>
          {grouped.map(([section, qs]) => (
            <Card key={section} title={section}>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {qs.map((q) => (
                  <div key={q.id} style={{ borderBottom: "1px solid #f2f2f2", padding: "12px 0" }}>
                    {editingId === q.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 12, color: "#6E6E6E" }}>
                          Q{q.qnum ?? "?"} &middot; {q.answerType}
                          {q.protectedNote && <ProtectedBadge note={q.protectedNote} />}
                        </div>
                        <textarea
                          value={editForm.text}
                          onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                          style={{ ...inputStyle, width: "100%", minHeight: 60, boxSizing: "border-box", fontFamily: "inherit" }}
                        />
                        {OPTIONS_ANSWER_TYPES.has(q.answerType) && (
                          <div>
                            <label style={labelStyle}>Options (separate with ;)</label>
                            <input
                              value={editForm.optionsRaw}
                              onChange={(e) => setEditForm({ ...editForm, optionsRaw: e.target.value })}
                              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                            />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={editForm.required}
                              onChange={(e) => setEditForm({ ...editForm, required: e.target.checked })}
                            />
                            Required
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                            Order
                            <input
                              type="number"
                              value={editForm.order}
                              onChange={(e) => setEditForm({ ...editForm, order: Number(e.target.value) })}
                              style={{ ...inputStyle, width: 70 }}
                            />
                          </label>
                          <button type="button" disabled={saving} onClick={() => saveEdit(q)} style={buttonStyle}>
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} style={linkButtonStyle}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
                            <span style={{ color: "#6E6E6E", marginRight: 6 }}>Q{q.qnum ?? "?"}.</span>
                            {q.text}
                            {q.required && <span style={{ color: "#E6017E" }}> *</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                            {q.answerType}
                            {q.optionsRaw && ` · ${q.optionsRaw}`}
                            {q.protectedNote && <ProtectedBadge note={q.protectedNote} />}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(q)}
                          title="Edit this question"
                          style={pencilButtonStyle}
                        >
                          ✎
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {addingSection === section ? (
                <AddQuestionForm
                  addForm={addForm}
                  setAddForm={setAddForm}
                  creating={creating}
                  onCancel={() => setAddingSection(null)}
                  onSubmit={submitAdd}
                  sectionLabel={section}
                />
              ) : (
                <button type="button" onClick={() => startAdd(section)} style={{ ...linkButtonStyle, marginTop: 12 }}>
                  + Add new question to {section}
                </button>
              )}
            </Card>
          ))}

          <Card title="New section">
            {addingSection === "__new__" ? (
              <AddQuestionForm
                addForm={addForm}
                setAddForm={setAddForm}
                creating={creating}
                onCancel={() => {
                  setAddingSection(null);
                  setAddingNewSection(false);
                }}
                onSubmit={submitAdd}
                sectionLabel={null}
                newSection
                addingNewSection={addingNewSection}
                setAddingNewSection={setAddingNewSection}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingSection("__new__");
                  setAddingNewSection(true);
                  setAddForm({ text: "", answerType: "Short answer", optionsRaw: "", required: false, newSectionName: "" });
                }}
                style={linkButtonStyle}
              >
                + Add a question in a new section
              </button>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ProtectedBadge({ note }: { note: string }) {
  return (
    <span
      title={`Changing this option's wording could break automatic scoring/follow-up detection: ${note}. Renaming or removing an existing option is the risk - adding a new one, or editing text/required/order elsewhere, is safe.`}
      style={{
        display: "inline-block",
        marginLeft: 8,
        background: "#FFF3D6",
        color: "#8a5a00",
        borderRadius: 4,
        padding: "1px 6px",
        fontSize: 11,
        fontWeight: 600,
        cursor: "help",
      }}
    >
      ⚠ scored question
    </span>
  );
}

function AddQuestionForm({
  addForm,
  setAddForm,
  creating,
  onCancel,
  onSubmit,
  sectionLabel,
  newSection,
  addingNewSection,
  setAddingNewSection,
}: {
  addForm: { text: string; answerType: string; optionsRaw: string; required: boolean; newSectionName: string };
  setAddForm: (f: any) => void;
  creating: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  sectionLabel: string | null;
  newSection?: boolean;
  addingNewSection?: boolean;
  setAddingNewSection?: (v: boolean) => void;
}) {
  return (
    <div style={{ marginTop: 12, padding: 12, background: "#FAFAFA", borderRadius: 6, display: "flex", flexDirection: "column", gap: 10 }}>
      {newSection ? (
        <div>
          <label style={labelStyle}>Section name</label>
          <input
            value={addForm.newSectionName}
            onChange={(e) => setAddForm({ ...addForm, newSectionName: e.target.value })}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            placeholder="e.g. Seasonal POS"
          />
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#6E6E6E" }}>Adding to: {sectionLabel}</div>
      )}
      <div>
        <label style={labelStyle}>Question text</label>
        <textarea
          value={addForm.text}
          onChange={(e) => setAddForm({ ...addForm, text: e.target.value })}
          style={{ ...inputStyle, width: "100%", minHeight: 50, boxSizing: "border-box", fontFamily: "inherit" }}
        />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>Answer type</label>
          <select
            value={addForm.answerType}
            onChange={(e) => setAddForm({ ...addForm, answerType: e.target.value })}
            style={inputStyle}
          >
            {EDITABLE_ANSWER_TYPES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, alignSelf: "flex-end", paddingBottom: 9 }}>
          <input type="checkbox" checked={addForm.required} onChange={(e) => setAddForm({ ...addForm, required: e.target.checked })} />
          Required
        </label>
      </div>
      {OPTIONS_ANSWER_TYPES.has(addForm.answerType) && (
        <div>
          <label style={labelStyle}>Options (separate with ;)</label>
          <input
            value={addForm.optionsRaw}
            onChange={(e) => setAddForm({ ...addForm, optionsRaw: e.target.value })}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            placeholder="Yes; No"
          />
        </div>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" disabled={creating} onClick={onSubmit} style={buttonStyle}>
          {creating ? "Adding..." : "Add question"}
        </button>
        <button type="button" onClick={onCancel} style={linkButtonStyle}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#6E6E6E", marginBottom: 4 };
const buttonStyle: React.CSSProperties = { background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const linkButtonStyle: React.CSSProperties = { background: "none", border: "none", color: "#3348B0", fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" };
const pencilButtonStyle: React.CSSProperties = { background: "none", border: "1px solid #ddd", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 14, flexShrink: 0, color: "#6E6E6E" };
