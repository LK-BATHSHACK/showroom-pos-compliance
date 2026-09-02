"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { type PosQuestion } from "@/lib/posWalkaround";

type ShowroomOption = { id: string; name: string };

// Mirrors lib/airtable.ts's MAX_ATTACHMENT_BYTES (Airtable's own 5MB/file
// cap on the upload-attachment endpoint) - checked here too so a phone photo
// that's too big gets caught before the network round-trip, not after.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_QUESTION = 10;

export default function POSWalkaroundForm({
  showrooms,
  lockedShowroom,
  lockedShowroomError,
  submittedByName,
  questions,
}: {
  showrooms: ShowroomOption[];
  lockedShowroom: ShowroomOption | null;
  // Set when a Store Manager's site doesn't have POS checks (or isn't
  // linked to a Showroom yet) - shown instead of the form, per
  // resolveShowroomForSite in lib/posWalkaround.ts.
  lockedShowroomError: string | null;
  submittedByName: string;
  // Fetched server-side (fetchPOSQuestions(), lib/posWalkaround.ts) rather
  // than a hardcoded import, so Admin/H&S edits via the question editor
  // show up here without a code change - same source-of-truth move H&S's
  // questions already went through.
  questions: PosQuestion[];
}) {
  const [showroomId, setShowroomId] = useState<string>(lockedShowroom?.id || "");
  const [answers, setAnswers] = useState<Record<number, string>>({ 3: submittedByName });
  const [multiAnswers, setMultiAnswers] = useState<Record<number, string[]>>({});
  const [fileAnswers, setFileAnswers] = useState<Record<number, File[]>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [submitError, setSubmitError] = useState("");

  // Sectioned/paginated layout, same pattern as the H&S form (Lorraine, 2
  // Sep 2026: "can we make the pos follow a similar section plan?").
  const [currentSection, setCurrentSection] = useState(0);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);

  const showroomName = lockedShowroom?.name || showrooms.find((s) => s.id === showroomId)?.name || "";

  const sections = useMemo(() => {
    const map = new Map<string, PosQuestion[]>();
    questions.forEach((q) => {
      if (!map.has(q.section)) map.set(q.section, []);
      map.get(q.section)!.push(q);
    });
    return Array.from(map.entries());
  }, [questions]);

  const questionRanges = useMemo(() => {
    let idx = 0;
    return sections.map(([, qs]) => {
      const start = idx + 1;
      idx += qs.length;
      return [start, idx] as const;
    });
  }, [sections]);

  function setAnswer(q: PosQuestion, value: string) {
    setAnswers((prev) => ({ ...prev, [q.qnum]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[q.qnum];
      return next;
    });
  }

  function toggleMulti(q: PosQuestion, option: string, checked: boolean) {
    setMultiAnswers((prev) => {
      const current = prev[q.qnum] || [];
      const next = checked ? [...current, option] : current.filter((o) => o !== option);
      return { ...prev, [q.qnum]: next };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[q.qnum];
      return next;
    });
  }

  function setFiles(q: PosQuestion, incoming: FileList | null) {
    if (!incoming) return;
    const existing = fileAnswers[q.qnum] || [];
    const combined = [...existing, ...Array.from(incoming)];
    const tooBig = combined.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setErrors((prev) => ({ ...prev, [q.qnum]: `"${tooBig.name}" is over the 5MB limit - try a smaller photo.` }));
      return;
    }
    if (combined.length > MAX_FILES_PER_QUESTION) {
      setErrors((prev) => ({ ...prev, [q.qnum]: `Up to ${MAX_FILES_PER_QUESTION} files - remove some before adding more.` }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[q.qnum];
      return next;
    });
    setFileAnswers((prev) => ({ ...prev, [q.qnum]: combined }));
  }

  function removeFile(q: PosQuestion, index: number) {
    setFileAnswers((prev) => ({ ...prev, [q.qnum]: (prev[q.qnum] || []).filter((_, i) => i !== index) }));
  }

  function finalValueFor(q: PosQuestion): string {
    if (q.type === "checkbox") return (multiAnswers[q.qnum] || []).join("; ");
    if (q.type === "photo") {
      const n = (fileAnswers[q.qnum] || []).length;
      return n > 0 ? `${n} photo${n === 1 ? "" : "s"} attached` : "";
    }
    return answers[q.qnum] || "";
  }

  function validate(qs: PosQuestion[]): Record<number, string> {
    const newErrors: Record<number, string> = {};
    qs.forEach((q) => {
      if (q.type === "photo") {
        if (errors[q.qnum]) newErrors[q.qnum] = errors[q.qnum];
        return;
      }
      if (q.required && !finalValueFor(q).trim()) {
        newErrors[q.qnum] = "This is required.";
      }
    });
    return newErrors;
  }

  function goToSection(index: number) {
    setCurrentSection(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNext() {
    if (!showroomName) {
      setSubmitError("Pick a showroom first.");
      return;
    }
    setSubmitError("");
    const [, qs] = sections[currentSection];
    const sectionErrors = validate(qs);
    if (Object.keys(sectionErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...sectionErrors }));
      const firstQnum = qs.find((q) => sectionErrors[q.qnum])?.qnum;
      if (firstQnum !== undefined) setPendingScrollId(firstQnum);
      return;
    }
    goToSection(currentSection + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!showroomName) {
      setSubmitError("Pick a showroom first.");
      return;
    }

    const newErrors = validate(questions);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstErrorQnum = questions.find((q) => newErrors[q.qnum])?.qnum;
      if (firstErrorQnum !== undefined) {
        const sectionIndex = sections.findIndex(([, qs]) => qs.some((q) => q.qnum === firstErrorQnum));
        if (sectionIndex >= 0 && sectionIndex !== currentSection) setCurrentSection(sectionIndex);
        setPendingScrollId(firstErrorQnum);
      }
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    const payload = {
      showroomId: lockedShowroom?.id || showroomId,
      showroomName,
      answers: questions.filter((q) => q.type !== "photo").map((q) => ({ qnum: q.qnum, value: finalValueFor(q) })),
    };
    const formData = new FormData();
    formData.set("payload", JSON.stringify(payload));
    questions.forEach((q) => {
      if (q.type !== "photo") return;
      (fileAnswers[q.qnum] || []).forEach((file) => formData.append(`file__${q.qnum}`, file, file.name));
    });

    const res = await fetch("/api/pos-submission", { method: "POST", body: formData });
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

  if (lockedShowroomError) {
    return (
      <Card>
        <p style={{ color: "#6E6E6E" }}>{lockedShowroomError}</p>
      </Card>
    );
  }

  if (result) {
    return (
      <Card>
        <h2 style={{ marginTop: 0 }}>Submitted</h2>
        <p>Thanks {submittedByName.split(" ")[0]} - the walkaround for {showroomName} has been recorded.</p>
        <ul style={{ color: "#333", fontSize: 14 }}>
          <li>Score: {result.score}/100 ({result.rag})</li>
          <li>{result.actionsCreated} action{result.actionsCreated === 1 ? "" : "s"} raised for follow-up</li>
          {result.actionsVerified > 0 && <li>{result.actionsVerified} previously open action{result.actionsVerified === 1 ? "" : "s"} verified fixed</li>}
          {result.requestsCreated > 0 && <li>{result.requestsCreated} POS Request{result.requestsCreated === 1 ? "" : "s"} logged for review</li>}
          {result.photoUploadErrors?.length > 0 && (
            <li style={{ color: "#d03b3b" }}>
              {result.photoUploadErrors.length} photo{result.photoUploadErrors.length === 1 ? "" : "s"} didn't upload ({result.photoUploadErrors.join(", ")}) - everything else was recorded fine.
            </li>
          )}
        </ul>
        <button
          onClick={() => {
            setResult(null);
            setShowroomId(lockedShowroom?.id || "");
            setAnswers({ 3: submittedByName });
            setMultiAnswers({});
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
        {lockedShowroom ? (
          <div>
            <div style={{ fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>Showroom</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{lockedShowroom.name}</div>
          </div>
        ) : (
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#6E6E6E", marginBottom: 6 }}>Which showroom?</label>
            <select
              value={showroomId}
              onChange={(e) => setShowroomId(e.target.value)}
              style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, width: "100%", maxWidth: 340 }}
            >
              <option value="">Select a showroom...</option>
              {showrooms.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 20, marginBottom: 10, fontSize: 13, color: "#6E6E6E" }}>
        Section {currentSection + 1} of {sections.length}
        {questionRanges[currentSection] && (
          <>
            {" "}&middot; Question{questionRanges[currentSection][0] === questionRanges[currentSection][1] ? "" : "s"}{" "}
            {questionRanges[currentSection][0] === questionRanges[currentSection][1]
              ? questionRanges[currentSection][0]
              : `${questionRanges[currentSection][0]}-${questionRanges[currentSection][1]}`}{" "}
            of {questions.length}
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {sections.map(([section], i) => (
          <div
            key={section}
            title={section}
            style={{ height: 4, flex: 1, minWidth: 12, borderRadius: 2, background: i <= currentSection ? "#E6017E" : "#E0E0E0" }}
          />
        ))}
      </div>

      <Card title={activeSection[0]}>
        {activeSection[1].map((q) => (
          <QuestionField
            key={q.qnum}
            q={q}
            value={answers[q.qnum] || ""}
            multiValue={multiAnswers[q.qnum] || []}
            fileValue={fileAnswers[q.qnum] || []}
            error={errors[q.qnum]}
            onChange={(v) => setAnswer(q, v)}
            onMultiToggle={(opt, checked) => toggleMulti(q, opt, checked)}
            onFilesChange={(fl) => setFiles(q, fl)}
            onFileRemove={(i) => removeFile(q, i)}
          />
        ))}
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
    </form>
  );
}

function QuestionField({
  q,
  value,
  multiValue,
  fileValue,
  error,
  onChange,
  onMultiToggle,
  onFilesChange,
  onFileRemove,
}: {
  q: PosQuestion;
  value: string;
  multiValue: string[];
  fileValue: File[];
  error?: string;
  onChange: (v: string) => void;
  onMultiToggle: (opt: string, checked: boolean) => void;
  onFilesChange: (files: FileList | null) => void;
  onFileRemove: (index: number) => void;
}) {
  const label = (
    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, whiteSpace: "pre-wrap" }}>
      {`Q${q.qnum}. `}
      {q.text}
      {q.required && <span style={{ color: "#E6017E" }}> *</span>}
    </div>
  );

  let field: React.ReactNode;

  switch (q.type) {
    case "text":
      field = <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
      break;
    case "date":
      field = <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
      break;
    case "radio":
      field = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(q.options || []).map((opt) => (
            <label key={opt} style={radioLabelStyle}>
              <input type="radio" name={`q${q.qnum}`} checked={value === opt} onChange={() => onChange(opt)} /> {opt}
            </label>
          ))}
        </div>
      );
      break;
    case "checkbox":
      field = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(q.options || []).map((opt) => (
            <label key={opt} style={radioLabelStyle}>
              <input type="checkbox" checked={multiValue.includes(opt)} onChange={(e) => onMultiToggle(opt, e.target.checked)} /> {opt}
            </label>
          ))}
        </div>
      );
      break;
    case "photo":
      field = (
        <div>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => {
              onFilesChange(e.target.files);
              e.target.value = ""; // lets the same file be re-picked after a remove
            }}
            style={{ fontSize: 13 }}
          />
          <div style={{ fontSize: 12, color: "#6E6E6E", marginTop: 6 }}>
            Up to {MAX_FILES_PER_QUESTION} photos, 5MB each.
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
    <div id={`q-${q.qnum}`} style={{ marginBottom: 22, paddingBottom: 4 }}>
      {label}
      {q.helpText && <div style={{ fontSize: 12, color: "#6E6E6E", marginBottom: 6 }}>{q.helpText}</div>}
      {q.referenceImageUrl && (
        // Bigger than before (110px -> 200px), same reasoning as the H&S
        // form's reference photos (Lorraine, 2 Sep 2026).
        <a href={q.referenceImageUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginBottom: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={q.referenceImageUrl}
            alt={`What this should look like - ${q.text}`}
            style={{ width: 200, height: 200, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd", display: "block" }}
          />
          <div style={{ fontSize: 12, color: "#3348B0", marginTop: 4 }}>What this should look like</div>
        </a>
      )}
      {field}
      {error && <div style={{ color: "#d03b3b", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" };
const radioLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 14 };
