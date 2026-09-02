"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";

type SiteOption = { id: string; name: string; siteType: string | null; region: string | null };

type TemplateQuestion = {
  id: string;
  qnum: number | null;
  section: string;
  order: number;
  text: string;
  answerType:
    | "Short answer"
    | "Long answer"
    | "Date"
    | "Single choice"
    | "Yes/No"
    | "Matrix"
    | "Multiple choice (checkboxes)"
    | "File upload";
  options: string[];
  optionsRaw: string | null;
  required: boolean;
  referenceImages: { url: string; caption?: string }[];
};

// Mirrors lib/airtable.ts's MAX_ATTACHMENT_BYTES (Airtable's own 5MB/file
// cap on the upload-attachment endpoint) - checked here too so a phone photo
// that's too big gets caught before the network round-trip, not after.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_QUESTION = 10;

// ---------------------------------------------------------------------------
// Branching (Salli, 2 Sep 2026: "Q6 - if they say NO - could it remove Q7?
// like branching would on a MS Form?"). Q7 only makes sense if Q6 says
// there IS equipment on site; Q17 only makes sense if Q16 says the
// bins/food-waste schedule ISN'T in place. Both companion questions had
// their Airtable "Required" flag turned off (was unconditionally true
// before, which was its own bug - Salli: "Q17 - it's saying required
// whether I click yes or no on Q16") - this is what makes them required,
// and shown at all, exactly when the branch condition is met. Same idea as
// MS Forms branching, done in the client since Airtable's schema has no
// concept of conditional questions.
// ---------------------------------------------------------------------------
const CONDITIONAL_QUESTIONS: Record<number, { dependsOnQnum: number; showWhen: (answer: string) => boolean }> = {
  7: { dependsOnQnum: 6, showWhen: (a) => a === "Yes" },
  17: { dependsOnQnum: 16, showWhen: (a) => a === "No" },
};

// Matrix questions (Fire Warden Duties, Warehouse material handling) each
// have their own section's free-text "report an issue" question - Salli
// asked for a pointer to it right under the matrix when someone ticks "No"
// on anything ("if they click no - there isn't anywhere that pops up for
// them to state the problem? or for it to say - you can tell us the
// problem in Q9?", 2 Sep 2026). Q5 (Warehouse) -> Q9, Q35 (Fire Warden) ->
// Q40 - both are that section's own catch-all, same pattern, just two
// different question numbers because they're in different sections.
const MATRIX_ISSUE_POINTER: Record<number, number> = { 5: 9, 35: 40 };

export default function HSWalkaroundForm({
  sites,
  lockedSite,
  submittedByName,
}: {
  sites: SiteOption[];
  lockedSite: SiteOption | null;
  submittedByName: string;
}) {
  const [siteId, setSiteId] = useState<string>(lockedSite?.id || "");
  const [questions, setQuestions] = useState<TemplateQuestion[] | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [matrixAnswers, setMatrixAnswers] = useState<Record<string, Record<string, string>>>({});
  const [multiAnswers, setMultiAnswers] = useState<Record<string, string[]>>({});
  const [fileAnswers, setFileAnswers] = useState<Record<string, File[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [submitError, setSubmitError] = useState("");

  // Sectioned/paginated walkthrough (Salli, 2 Sep 2026: "Instead of it
  // scrolling down miles - can it be done in Sections that appear as one is
  // completed a new one appears? so they don't have to scroll much? and
  // also if they miss a question, it's not obvious until they get all the
  // way to the end.") - one section on screen at a time, Next validates
  // that section before moving on, so a missed required question is caught
  // immediately rather than only at final submit.
  const [currentSection, setCurrentSection] = useState(0);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId) {
      setQuestions(null);
      return;
    }
    setLoadingQuestions(true);
    fetch(`/api/hs-questions?siteId=${siteId}`)
      .then((r) => r.json())
      .then((body) => {
        setQuestions(body.questions || []);
        setAnswers({});
        setMatrixAnswers({});
        setMultiAnswers({});
        setFileAnswers({});
        setResult(null);
        setCurrentSection(0);
      })
      .finally(() => setLoadingQuestions(false));
  }, [siteId]);

  const sections = useMemo(() => {
    if (!questions) return [];
    const map = new Map<string, TemplateQuestion[]>();
    questions.forEach((q) => {
      if (!map.has(q.section)) map.set(q.section, []);
      map.get(q.section)!.push(q);
    });
    return Array.from(map.entries());
  }, [questions]);

  const qnumToId = useMemo(() => {
    const m = new Map<number, string>();
    questions?.forEach((q) => {
      if (q.qnum) m.set(q.qnum, q.id);
    });
    return m;
  }, [questions]);

  function answerForQnum(qn: number): string {
    const id = qnumToId.get(qn);
    return id ? answers[id] || "" : "";
  }

  function isVisible(q: TemplateQuestion): boolean {
    const cond = q.qnum ? CONDITIONAL_QUESTIONS[q.qnum] : undefined;
    if (!cond) return true;
    return cond.showWhen(answerForQnum(cond.dependsOnQnum));
  }

  function isRequired(q: TemplateQuestion): boolean {
    // A conditional question is required exactly when it's shown - that's
    // what makes it "branching" rather than just an always-optional field.
    if (q.qnum && CONDITIONAL_QUESTIONS[q.qnum]) return isVisible(q);
    return q.required;
  }

  function setAnswer(q: TemplateQuestion, value: string) {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
  }

  function setMatrixSub(q: TemplateQuestion, subQuestion: string, value: string) {
    setMatrixAnswers((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), [subQuestion]: value } }));
  }

  function toggleMulti(q: TemplateQuestion, option: string, checked: boolean) {
    setMultiAnswers((prev) => {
      const current = prev[q.id] || [];
      const next = checked ? [...current, option] : current.filter((o) => o !== option);
      return { ...prev, [q.id]: next };
    });
  }

  function setFiles(q: TemplateQuestion, incoming: FileList | null) {
    if (!incoming) return;
    const existing = fileAnswers[q.id] || [];
    const combined = [...existing, ...Array.from(incoming)];
    const tooBig = combined.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setErrors((prev) => ({ ...prev, [q.id]: `"${tooBig.name}" is over the 5MB limit - try a smaller photo.` }));
      return;
    }
    if (combined.length > MAX_FILES_PER_QUESTION) {
      setErrors((prev) => ({ ...prev, [q.id]: `Up to ${MAX_FILES_PER_QUESTION} files - remove some before adding more.` }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
    setFileAnswers((prev) => ({ ...prev, [q.id]: combined }));
  }

  function removeFile(q: TemplateQuestion, index: number) {
    setFileAnswers((prev) => ({ ...prev, [q.id]: (prev[q.id] || []).filter((_, i) => i !== index) }));
  }

  function finalValueFor(q: TemplateQuestion): string {
    if (q.answerType === "Matrix") return JSON.stringify(matrixAnswers[q.id] || {});
    if (q.answerType === "Multiple choice (checkboxes)") return (multiAnswers[q.id] || []).join("; ");
    if (q.answerType === "File upload") {
      const n = (fileAnswers[q.id] || []).length;
      return n > 0 ? `${n} photo${n === 1 ? "" : "s"} attached` : "";
    }
    return answers[q.id] || "";
  }

  // Validates a set of questions (a single section, or everything at final
  // submit) - skips anything currently hidden by branching, and skips File
  // upload's "required" (photos are optional; a rejected-file message
  // should still block though).
  function validate(qs: TemplateQuestion[]): Record<string, string> {
    const newErrors: Record<string, string> = {};
    qs.forEach((q) => {
      if (!isVisible(q)) return;
      if (q.answerType === "File upload") {
        if (errors[q.id]) newErrors[q.id] = errors[q.id];
        return;
      }
      if (isRequired(q) && !finalValueFor(q).trim()) {
        newErrors[q.id] = "This is required.";
      }
    });
    return newErrors;
  }

  function goToSection(index: number) {
    setCurrentSection(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNext() {
    const [, qs] = sections[currentSection];
    const sectionErrors = validate(qs);
    if (Object.keys(sectionErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...sectionErrors }));
      const firstId = qs.find((q) => sectionErrors[q.id])?.id;
      if (firstId) setPendingScrollId(firstId);
      return;
    }
    goToSection(currentSection + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!questions || !siteId) return;

    const newErrors = validate(questions);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstErrorQ = questions.find((q) => newErrors[q.id]);
      if (firstErrorQ) {
        const sectionIndex = sections.findIndex(([, qs]) => qs.some((q) => q.id === firstErrorQ.id));
        if (sectionIndex >= 0 && sectionIndex !== currentSection) {
          setCurrentSection(sectionIndex);
        }
        setPendingScrollId(firstErrorQ.id);
      }
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    // Hidden (branched-away) questions are still sent with whatever value
    // they hold (usually blank) - the server only persists answers to
    // questions it recognises as applicable, same as always.
    const payload = {
      siteId,
      answers: questions.map((q) => ({ questionId: q.id, value: finalValueFor(q) })),
    };
    const formData = new FormData();
    formData.set("payload", JSON.stringify(payload));
    questions.forEach((q) => {
      if (q.answerType !== "File upload") return;
      (fileAnswers[q.id] || []).forEach((file) => formData.append(`file__${q.id}`, file, file.name));
    });

    const res = await fetch("/api/hs-submission", { method: "POST", body: formData });
    setSubmitting(false);
    const body = await res.json();
    if (!res.ok) {
      setSubmitError(body.error || "Something went wrong.");
      return;
    }
    setResult(body);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (!pendingScrollId) return;
    const el = document.getElementById(`q-${pendingScrollId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScrollId(null);
    }
  }, [pendingScrollId, currentSection]);

  if (result) {
    return (
      <Card>
        <h2 style={{ marginTop: 0 }}>Submitted</h2>
        <p>Thanks {submittedByName.split(" ")[0]} - the walkaround for this site has been recorded.</p>
        <ul style={{ color: "#333", fontSize: 14 }}>
          <li>{result.answersCreated} answers recorded</li>
          <li>{result.actionsCreated} action{result.actionsCreated === 1 ? "" : "s"} raised for follow-up</li>
          {result.immediateEscalationSent && <li style={{ color: "#d03b3b", fontWeight: 600 }}>An accident/incident/near-miss escalation email was sent immediately.</li>}
          {result.photoUploadErrors?.length > 0 && (
            <li style={{ color: "#d03b3b" }}>
              {result.photoUploadErrors.length} photo{result.photoUploadErrors.length === 1 ? "" : "s"} didn't upload ({result.photoUploadErrors.join(", ")}) - everything else was recorded fine, but please email those photos directly as a backup.
            </li>
          )}
        </ul>
        <button
          onClick={() => {
            setResult(null);
            setSiteId(lockedSite?.id || "");
            setQuestions(null);
            setFileAnswers({});
            setCurrentSection(0);
          }}
          style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Start another walkaround
        </button>
      </Card>
    );
  }

  const activeSection = sections[currentSection];
  const isLastSection = currentSection === sections.length - 1;

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        {lockedSite ? (
          <div>
            <div style={{ fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>Site</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{lockedSite.name}</div>
          </div>
        ) : (
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#6E6E6E", marginBottom: 6 }}>Which site?</label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, width: "100%", maxWidth: 340 }}
            >
              <option value="">Select a site...</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {loadingQuestions && <p style={{ color: "#6E6E6E", marginTop: 20 }}>Loading questions for this site...</p>}

      {sections.length > 0 && (
        <>
          <div style={{ marginTop: 20, marginBottom: 10, fontSize: 13, color: "#6E6E6E" }}>
            Section {currentSection + 1} of {sections.length}
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {sections.map(([section], i) => (
              <div
                key={section}
                title={section}
                style={{
                  height: 4,
                  flex: 1,
                  minWidth: 12,
                  borderRadius: 2,
                  background: i <= currentSection ? "#E6017E" : "#E0E0E0",
                }}
              />
            ))}
          </div>

          <Card title={activeSection[0]}>
            {activeSection[1].map((q) => {
              if (!isVisible(q)) return null;
              return (
                <QuestionField
                  key={q.id}
                  q={q}
                  required={isRequired(q)}
                  value={answers[q.id] || ""}
                  matrixValue={matrixAnswers[q.id] || {}}
                  multiValue={multiAnswers[q.id] || []}
                  fileValue={fileAnswers[q.id] || []}
                  error={errors[q.id]}
                  onChange={(v) => setAnswer(q, v)}
                  onMatrixChange={(sub, v) => setMatrixSub(q, sub, v)}
                  onMultiToggle={(opt, checked) => toggleMulti(q, opt, checked)}
                  onFilesChange={(fl) => setFiles(q, fl)}
                  onFileRemove={(i) => removeFile(q, i)}
                />
              );
            })}
          </Card>

          <div style={{ marginTop: 20, marginBottom: 40, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {currentSection > 0 && (
              <button
                type="button"
                onClick={() => goToSection(currentSection - 1)}
                style={{ background: "#fff", color: "#1D1C1D", border: "1px solid #ccc", borderRadius: 6, padding: "12px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
              >
                Back
              </button>
            )}
            {!isLastSection && (
              <button
                type="button"
                onClick={handleNext}
                style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "12px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
              >
                Next
              </button>
            )}
            {isLastSection && (
              <button
                type="submit"
                disabled={submitting}
                style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "12px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
              >
                {submitting ? "Submitting..." : "Submit walkaround"}
              </button>
            )}
            {submitError && <div style={{ color: "#d03b3b", fontSize: 13, width: "100%" }}>{submitError}</div>}
          </div>
        </>
      )}
    </form>
  );
}

// Turns bare http(s):// URLs in question text into real clickable links
// (Salli, 2 Sep 2026: "Can we get the links to work as links or not
// possible?") - several questions (Q8, Q27, Q36, Q59) include a raw
// SharePoint/MS Forms URL in the text. Trailing punctuation (a "." ending
// the sentence, a closing bracket) is kept outside the link rather than
// swallowed into the href.
function linkify(text: string): React.ReactNode[] {
  const regex = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text))) {
    let url = match[0];
    let trailing = "";
    while (url.length > 0 && /[.,;:)\]}'"]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a key={key++} href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#3348B0", wordBreak: "break-all" }}>
        {url}
      </a>
    );
    if (trailing) parts.push(trailing);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function QuestionField({
  q,
  required,
  value,
  matrixValue,
  multiValue,
  fileValue,
  error,
  onChange,
  onMatrixChange,
  onMultiToggle,
  onFilesChange,
  onFileRemove,
}: {
  q: TemplateQuestion;
  required: boolean;
  value: string;
  matrixValue: Record<string, string>;
  multiValue: string[];
  fileValue: File[];
  error?: string;
  onChange: (v: string) => void;
  onMatrixChange: (sub: string, v: string) => void;
  onMultiToggle: (opt: string, checked: boolean) => void;
  onFilesChange: (files: FileList | null) => void;
  onFileRemove: (index: number) => void;
}) {
  const label = (
    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, whiteSpace: "pre-wrap" }}>
      {q.qnum ? `Q${q.qnum}. ` : ""}
      {linkify(q.text)}
      {required && <span style={{ color: "#E6017E" }}> *</span>}
    </div>
  );

  let field: React.ReactNode;
  let matrixHint: React.ReactNode = null;

  switch (q.answerType) {
    case "Short answer":
      field = <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
      break;
    case "Long answer":
      field = <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />;
      break;
    case "Date":
      // Already a native browser date picker (desktop and mobile both show
      // their own calendar UI for type="date" - nothing to build here).
      field = <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
      break;
    case "Yes/No":
      field = (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {["Yes", "No"].map((opt) => (
            <label key={opt} style={radioLabelStyle}>
              <input type="radio" name={q.id} checked={value === opt} onChange={() => onChange(opt)} /> {opt}
            </label>
          ))}
        </div>
      );
      break;
    case "Single choice":
      field = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {q.options.map((opt) => (
            <label key={opt} style={radioLabelStyle}>
              <input type="radio" name={q.id} checked={value === opt} onChange={() => onChange(opt)} /> {opt}
            </label>
          ))}
        </div>
      );
      break;
    case "Multiple choice (checkboxes)":
      field = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {q.options.map((opt) => (
            <label key={opt} style={radioLabelStyle}>
              <input type="checkbox" checked={multiValue.includes(opt)} onChange={(e) => onMultiToggle(opt, e.target.checked)} /> {opt}
            </label>
          ))}
        </div>
      );
      break;
    case "Matrix": {
      // Radio buttons instead of a per-row dropdown (Salli, 2 Sep 2026: "Is
      // there a way to have a radio button instead of a dropdown box - less
      // clicks") - same Yes/No/Covered elsewhere options, just fewer taps
      // to answer each row on a phone.
      const anyNo = q.options.some((sub) => matrixValue[sub] === "No");
      const pointerQnum = q.qnum ? MATRIX_ISSUE_POINTER[q.qnum] : undefined;
      field = (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {q.options.map((sub) => (
            <div key={sub} style={{ borderBottom: "1px solid #f2f2f2", paddingBottom: 10 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>{sub}</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {["Yes", "No", "Covered elsewhere"].map((opt) => (
                  <label key={opt} style={radioLabelStyle}>
                    <input
                      type="radio"
                      name={`${q.id}__${sub}`}
                      checked={matrixValue[sub] === opt}
                      onChange={() => onMatrixChange(sub, opt)}
                    />{" "}
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
      if (anyNo && pointerQnum) {
        matrixHint = (
          <div style={{ fontSize: 12, color: "#966400", background: "#FFF4E0", borderRadius: 6, padding: "8px 10px", marginTop: 10 }}>
            Answered "No" to any of these? Please give the details in Q{pointerQnum} below.
          </div>
        );
      }
      break;
    }
    case "File upload":
      field = (
        <div>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => {
              onFilesChange(e.target.files);
              e.target.value = ""; // lets the same file be re-picked after a remove
            }}
            style={{ fontSize: 13 }}
          />
          <div style={{ fontSize: 12, color: "#6E6E6E", marginTop: 6 }}>
            Up to {MAX_FILES_PER_QUESTION} photos, 5MB each. If a file's too big or this doesn't work on your device, email it directly instead - same as the accident/incident question above.
          </div>
          {fileValue.length > 0 && (
            <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13 }}>
              {fileValue.map((f, i) => (
                <li key={`${f.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{f.name} ({(f.size / 1024 / 1024).toFixed(1)}MB)</span>
                  <button
                    type="button"
                    onClick={() => onFileRemove(i)}
                    style={{ border: "none", background: "none", color: "#E6017E", cursor: "pointer", fontSize: 12, padding: 0 }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
      break;
    default:
      field = <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
  }

  return (
    <div id={`q-${q.id}`} style={{ marginBottom: 22, paddingBottom: 4 }}>
      {label}
      {q.referenceImages.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          {q.referenceImages.map((img) => (
            <a key={img.url} href={img.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.caption ? `What this should look like - ${img.caption}` : "What this should look like"}
                style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 6, border: "1px solid #ddd", display: "block" }}
              />
              <div style={{ fontSize: 11, color: "#3348B0", marginTop: 3, maxWidth: 110 }}>{img.caption || "What this should look like"}</div>
            </a>
          ))}
        </div>
      )}
      {field}
      {matrixHint}
      {error && <div style={{ color: "#d03b3b", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" };
const radioLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 14 };
