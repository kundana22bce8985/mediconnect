
"use client";

import { useState } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";

const API_URL = "http://127.0.0.1:8010";

const SECTIONS = [
  {
    key: "EXTRACTED REPORT TEXT",
    title: "Extracted Report Information",
    icon: "📄",
  },
  {
    key: "REPORT SUMMARY",
    title: "Report Summary",
    icon: "📋",
  },
  {
    key: "KEY TEST RESULTS",
    title: "Key Test Results",
    icon: "🩺",
  },
  {
    key: "RESULTS OUTSIDE REFERENCE RANGES",
    title: "Results Outside Reference Ranges",
    icon: "📊",
  },
  {
    key: "QUESTIONS FOR THE DOCTOR",
    title: "Questions for Your Doctor",
    icon: "👨‍⚕️",
  },
  {
    key: "IMPORTANT LIMITATIONS",
    title: "Important Limitations",
    icon: "⚠️",
  },
];

function parseAnalysis(raw) {
  const text = raw.replace(/\r\n/g, "\n");

  const headings = SECTIONS.map((section) => section.key);

  const headingRegex = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,4}\\s*)?(?:\\*\\*)?(${headings
      .map((heading) =>
        heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      )
      .join("|")})(?:\\*\\*)?\\s*(?:[:\\-–]\\s*)?`,
    "gi"
  );

  const matches = [...text.matchAll(headingRegex)];
  const parsed = {};

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const start = current.index + current[0].length;
    const end =
      i + 1 < matches.length ? matches[i + 1].index : text.length;

    parsed[current[1].toUpperCase()] = text
      .slice(start, end)
      .trim();
  }

  return parsed;
}

function ResultContent({ text }) {
  if (!text) {
    return (
      <p className="text-sm text-slate-500">
        No information provided.
      </p>
    );
  }

  const cleaned = text
    .replace(
      /\s+-\s+(?=[A-Z][A-Za-z ]{2,35}:)/g,
      "\n- "
    )
    .replace(
      /\s+-\s+(?=What |Are |How |Could |Should |Is |Do )/g,
      "\n- "
    );

  const lines = cleaned
    .split("\n")
    .filter((line) => line.trim());

  return (
    <div className="space-y-3 text-sm leading-7 text-slate-700">
      {lines.map((line, index) => {
        const value = line.trim();

        if (
          value.startsWith("- ") ||
          value.startsWith("• ")
        ) {
          return (
            <div
              key={index}
              className="flex items-start gap-3"
            >
              <span className="mt-1 text-teal-600">
                ●
              </span>

              <p className="flex-1">
                {value
                  .replace(/^[-•]\s*/, "")
                  .replace(/\*\*/g, "")}
              </p>
            </div>
          );
        }

        return (
          <p
            key={index}
            className="whitespace-pre-wrap"
          >
            {value.replace(/\*\*/g, "")}
          </p>
        );
      })}
    </div>
  );
}

export default function ReportAnalysisPage() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const parsed = analysis ? parseAnalysis(analysis) : {};
  const hasSections = Object.keys(parsed).length > 0;

  function handleFileChange(event) {
    const selected = event.target.files?.[0];

    setFile(null);
    setAnalysis("");
    setError("");
    setCopied(false);

    if (!selected) return;

    const extension = selected.name
      .split(".")
      .pop()
      ?.toLowerCase();

    if (
      !["pdf", "png", "jpg", "jpeg"].includes(extension)
    ) {
      setError(
        "Please select a PDF, PNG, JPG, or JPEG file."
      );
      event.target.value = "";
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError("File size must be 10 MB or less.");
      event.target.value = "";
      return;
    }

    if (selected.size === 0) {
      setError("The selected file is empty.");
      event.target.value = "";
      return;
    }

    setFile(selected);
  }

  async function handleAnalyze() {
    if (!file || loading) return;

    setLoading(true);
    setError("");
    setAnalysis("");
    setCopied(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        `${API_URL}/analyze`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to analyze the report."
        );
      }

      if (!data.analysis) {
        throw new Error(
          "AI returned an empty analysis."
        );
      }

      setAnalysis(data.analysis);
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to the Python AI backend. Make sure port 8010 is running."
          : err.message || "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setAnalysis("");
    setError("");
    setCopied(false);
  }

  async function handleCopy() {
    if (!analysis) return;

    try {
      await navigator.clipboard.writeText(analysis);
      setCopied(true);
    } catch {
      setError("Unable to copy the analysis.");
    }
  }

  function handleDownloadPDF() {
    if (!analysis) return;

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const margin = 18;
      const maxWidth = pageWidth - margin * 2;

      let y = 22;

      function ensureSpace(height = 10) {
        if (y + height > pageHeight - 20) {
          doc.addPage();
          y = 22;
        }
      }

      function addText(text, fontSize = 10, bold = false) {
        doc.setFont(
          "helvetica",
          bold ? "bold" : "normal"
        );

        doc.setFontSize(fontSize);
        doc.setTextColor(40, 50, 65);

        const safeText = String(text)
          .replace(/\*\*/g, "")
          .replace(/[^\x20-\x7E\n]/g, " ");

        const lines = doc.splitTextToSize(
          safeText,
          maxWidth
        );

        const lineHeight = fontSize * 0.45 + 1.5;

        for (const line of lines) {
          ensureSpace(lineHeight);
          doc.text(line || " ", margin, y);
          y += lineHeight;
        }
      }

      doc.setFillColor(15, 118, 110);
      doc.rect(0, 0, pageWidth, 38, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);

      doc.text(
        "MediConnect+",
        margin,
        17
      );

      doc.setFontSize(11);
      doc.text(
        "AI Medical Report Analysis",
        margin,
        27
      );

      y = 49;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);

      doc.text(
        `Generated: ${new Date().toLocaleString()}`,
        margin,
        y
      );

      y += 13;

      const sections = parseAnalysis(analysis);

      if (Object.keys(sections).length > 0) {
        for (const section of SECTIONS) {
          const content = sections[section.key];

          if (!content) continue;

          ensureSpace(18);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(15, 118, 110);

          doc.text(
            section.title,
            margin,
            y
          );

          y += 8;

          addText(content, 10, false);

          y += 8;
        }
      } else {
        addText(analysis, 10, false);
      }

      ensureSpace(30);

      y += 5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(150, 80, 20);

      doc.text(
        "Important Medical Disclaimer",
        margin,
        y
      );

      y += 8;

      addText(
        "This AI-generated analysis is for educational purposes only. It is not a medical diagnosis. AI can make mistakes. Verify all medical values against the original report and consult a qualified healthcare professional.",
        9
      );

      const totalPages =
        doc.internal.getNumberOfPages();

      for (
        let page = 1;
        page <= totalPages;
        page++
      ) {
        doc.setPage(page);

        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);

        doc.text(
          `MediConnect+ | Page ${page} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
      }

      doc.save(
        "MediConnect_Medical_Report_Analysis.pdf"
      );
    } catch (err) {
      console.error("PDF download error:", err);
      setError(
        "Unable to generate PDF. Please try again."
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* NAVIGATION */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <Link
            href="/"
            className="text-2xl font-extrabold text-teal-700"
          >
            MediConnect
            <span className="text-sky-500">+</span>
          </Link>

          <nav className="flex items-center gap-5 text-sm font-medium">
            <Link
              href="/"
              className="text-slate-600 hover:text-teal-700"
            >
              Home
            </Link>

            <Link
              href="/report-analysis"
              className="font-semibold text-teal-700"
            >
              AI Report Analysis
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 px-5 py-14 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 inline-flex rounded-full border border-white/30 bg-white/15 px-4 py-2 text-xs font-semibold">
            ✨ AI-Powered Healthcare Assistance
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
            AI Medical Report Analysis
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-teal-50">
            Upload your medical report and receive an
            easy-to-understand explanation of its
            contents, test results, and questions
            to discuss with your doctor.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-10">
        {/* UPLOAD CARD */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-9">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">
              Upload Medical Report
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Supported formats: PDF, JPG, JPEG and PNG.
              Maximum file size: 10 MB.
            </p>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/50 px-5 py-12 text-center transition hover:bg-teal-50">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm">
              📁
            </div>

            <span className="text-base font-bold text-slate-800">
              {file
                ? file.name
                : "Click to choose your medical report"}
            </span>

            <span className="mt-2 text-sm text-slate-500">
              {file
                ? `${(file.size / 1024).toFixed(1)} KB selected`
                : "Choose a PDF or an image from your device"}
            </span>

            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={handleFileChange}
              className="sr-only"
              disabled={loading}
            />
          </label>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!file || loading}
              className="rounded-xl bg-teal-700 px-7 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "⏳ Analyzing Report..."
                : "✨ Analyze Report"}
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          {loading && (
            <div
              role="status"
              className="mt-6 rounded-xl border border-teal-100 bg-teal-50 p-5"
            >
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />

                <p className="font-semibold text-teal-800">
                  Gemini AI is analyzing your report...
                </p>
              </div>

              <p className="mt-3 text-sm text-teal-700">
                Please wait while the AI extracts
                medical information and prepares
                your report summary.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"
            >
              ⚠️ {error}
            </div>
          )}
        </section>

        {/* ANALYSIS RESULTS */}
        {analysis && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  ✓ Analysis Complete
                </div>

                <h2 className="text-2xl font-extrabold">
                  Your Medical Report Results
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  AI-generated explanation of your
                  uploaded medical report
                </p>
              </div>

              {/* COPY + DOWNLOAD BUTTONS */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-xl border border-teal-200 bg-white px-5 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-50"
                >
                  {copied
                    ? "✓ Copied"
                    : "📋 Copy Analysis"}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
                >
                  📥 Download PDF
                </button>
              </div>
            </div>

            {/* RESULT CARDS */}
            {hasSections ? (
              <div className="grid gap-5 md:grid-cols-2">
                {SECTIONS.map((section) => {
                  const content = parsed[section.key];

                  if (!content) return null;

                  return (
                    <article
                      key={section.key}
                      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${
                        section.key === "REPORT SUMMARY" ||
                        section.key === "EXTRACTED REPORT TEXT"
                          ? "md:col-span-2"
                          : ""
                      }`}
                    >
                      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-2xl">
                          {section.icon}
                        </span>

                        <h3 className="text-lg font-bold text-slate-900">
                          {section.title}
                        </h3>
                      </div>

                      <ResultContent text={content} />
                    </article>
                  );
                })}
              </div>
            ) : (
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-xl font-bold">
                  AI Analysis
                </h3>

                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {analysis}
                </p>
              </article>
            )}

            {/* DISCLAIMER */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <h3 className="font-bold text-blue-900">
                ℹ️ Important Medical Information
              </h3>

              <p className="mt-2 text-sm leading-6 text-blue-900">
                This AI-generated analysis is for
                educational purposes only and is
                not a medical diagnosis.
                AI can misread medical values.
                Always verify results against the
                original medical report and consult
                a qualified healthcare professional.
              </p>
            </div>
          </section>
        )}

        {/* HOW IT WORKS */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-9">
          <h2 className="text-2xl font-bold">
            How It Works
          </h2>

          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: "📤",
                title: "1. Upload Report",
                description:
                  "Select a PDF or image containing your medical report.",
              },
              {
                icon: "🤖",
                title: "2. AI Reads the Report",
                description:
                  "Gemini extracts and explains the medical information.",
              },
              {
                icon: "📊",
                title: "3. View and Download",
                description:
                  "Read the results and download your analysis as a PDF.",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="rounded-2xl bg-slate-50 p-5"
              >
                <div className="mb-4 text-3xl">
                  {step.icon}
                </div>

                <h3 className="font-bold">
                  {step.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-center text-xs leading-6 text-slate-500">
          For demonstration, use fictional or
          properly de-identified medical reports.
          Do not upload real patient information
          until appropriate privacy, consent,
          and security controls are in place.
        </p>
      </div>
    </main>
  );
}
