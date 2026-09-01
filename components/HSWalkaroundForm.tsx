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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!questions || !siteId) return;

    const newErrors: Record<string, string> = {};
    questions.forEach((q) => {
      if (q.answerType === "File upload") {
        // Never blocks on "required" - photos are optional, with an
        // email-photos-directly fallback shown under the field - but a
        // rejected-file message from setFiles() (too big / too many)
        // should still stop submission until it's cleared.
        if (errors[q.id]) newErrors[q.id] = errors[q.id];
        return;
      }
      if (q.required && !finalValueFor(q).trim()) {
        newErrors[q.id] = "This is required.";
      }
    });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstId = Object.keys(newErrors)[0];
      document.getElementById(`q-${firstId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);
    setSubmitError("");
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
          }}
          style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Start another walkaround
        </button>
      </Card>
    );
  }

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
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, minWidth: 280 }}>
              <option value="">Select a site...</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {loadingQuestions && <p style={{ color: "#6E6E6E", marginTop: 20 }}>Loading questions for this site...</p>}

      {sections.map(([section, qs]) => (
        <div key={section} style={{ marginTop: 20 }}>
          <Card title={section}>
            {qs.map((q) => (
              <QuestionField
                key={q.id}
                q={q}
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
            ))}
          </Card>
        </div>
      ))}

      {questions && questions.length > 0 && (
        <div style={{ marginTop: 20, marginBottom: 40 }}>
          {submitError && <div style={{ color: "#d03b3b", fontSize: 13, marginBottom: 12 }}>{submitError}</div>}
          <button
            type="submit"
            disabled={submitting}
            style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "12px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            {submitting ? "Submitting..." : "Submit walkaround"}
          </button>
        </div>
      )}
    </form>
  );
}

function QuestionField({
  q,
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
      {q.text}
      {q.required && <span style={{ color: "#E6017E" }}> *</span>}
    </div>
  );

  let field: React.ReactNode;

  switch (q.answerType) {
    case "Short answer":
      field = <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
      break;
    case "Long answer":
      field = <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />;
      break;
    case "Date":
      field = <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
      break;
    case "Yes/No":
      field = (
        <div style={{ display: "flex", gap: 16 }}>
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
    case "Matrix":
      field = (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.options.map((sub) => (
            <div key={sub} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderBottom: "1px solid #f2f2f2", paddingBottom: 8 }}>
              <div style={{ fontSize: 13, flex: 1 }}>{sub}</div>
              <select
                value={matrixValue[sub] || ""}
                onChange={(e) => onMatrixChange(sub, e.target.value)}
                style={{ ...inputStyle, width: 180 }}
              >
                <option value="">Select...</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Covered elsewhere">Covered elsewhere</option>
              </select>
            </div>
          ))}
        </div>
      );
      break;
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
                <li key={`${f.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
      {error && <div style={{ color: "#d03b3b", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" };
const radioLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 14 };
