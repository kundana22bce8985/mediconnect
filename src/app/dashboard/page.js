
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import { api, clearAuth, getAuth } from "../../lib/mediconnectAuth";

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function formatTime(value) {
  if (!value) return "Not available";
  const [hour, minute] = String(value).split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return String(value);
  }

  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${
    hour >= 12 ? "PM" : "AM"
  }`;
}

function formatReportDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function normalizeReports(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reports)) return data.reports;
  return [];
}

export default function PatientDashboard() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [medicalReports, setMedicalReports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [selectedReportId, setSelectedReportId] = useState(null);

  const [analyzingReportId, setAnalyzingReportId] = useState(null);
  const [aiResults, setAiResults] = useState({});
  const [aiErrors, setAiErrors] = useState({});

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (!getAuth()?.token) {
        router.replace("/login");
        return;
      }

      try {
        const [patient, appointmentData, doctorData] =
          await Promise.all([
            api("/api/me"),
            api("/api/appointments"),
            api("/api/doctors"),
          ]);

        if (!active) return;

        setUser(patient);
        setAppointments(
          Array.isArray(appointmentData) ? appointmentData : []
        );
        setDoctors(
          Array.isArray(doctorData) ? doctorData : []
        );
      } catch (err) {
        if (!active) return;
        setError(err.message || "Unable to load dashboard");
      } finally {
        if (active) setLoading(false);
      }

      try {
        const reportData = await api("/api/patient/reports");

        if (!active) return;

        setMedicalReports(normalizeReports(reportData));
        setReportError("");
      } catch (err) {
        if (!active) return;

        setReportError(
          err.message || "Unable to load medical reports"
        );
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [router]);

  async function refreshDashboard() {
    setRefreshing(true);
    setError("");
    setReportError("");

    try {
      const results = await Promise.allSettled([
        api("/api/me"),
        api("/api/appointments"),
        api("/api/doctors"),
        api("/api/patient/reports"),
      ]);

      const [
        patient,
        appointmentsResult,
        doctorsResult,
        reportsResult,
      ] = results;

      if (patient.status === "fulfilled") {
        setUser(patient.value);
      } else {
        setError(
          patient.reason?.message || "Profile refresh failed"
        );
      }

      if (appointmentsResult.status === "fulfilled") {
        setAppointments(
          Array.isArray(appointmentsResult.value)
            ? appointmentsResult.value
            : []
        );
      }

      if (doctorsResult.status === "fulfilled") {
        setDoctors(
          Array.isArray(doctorsResult.value)
            ? doctorsResult.value
            : []
        );
      }

      if (reportsResult.status === "fulfilled") {
        setMedicalReports(
          normalizeReports(reportsResult.value)
        );
      } else {
        setReportError(
          reportsResult.reason?.message || "Report refresh failed"
        );
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    try {
      await api("/api/logout", { method: "POST" });
    } catch {
      // Clear local session if backend is unavailable.
    }

    clearAuth();
    router.replace("/login");
  }

  // NEW: Analyze an existing doctor-issued report
  // without uploading a PDF or image.
  async function analyzeSavedReport(report) {
    const confirmed = window.confirm(
      "Send this doctor's report to Gemini AI for an educational explanation?"
    );

    if (!confirmed) return;

    setAnalyzingReportId(report.id);

    setAiErrors((prev) => ({
      ...prev,
      [report.id]: "",
    }));

    try {
      const result = await api(
        "/api/patient/reports/analyze",
        {
          method: "POST",
          body: new URLSearchParams({
            reportId: String(report.id),
          }),
        }
      );

      if (!result?.analysis) {
        throw new Error("AI returned an empty explanation");
      }

      setAiResults((prev) => ({
        ...prev,
        [report.id]: result.analysis,
      }));

      setSelectedReportId(report.id);
    } catch (err) {
      setAiErrors((prev) => ({
        ...prev,
        [report.id]:
          err.message || "AI analysis failed",
      }));
    } finally {
      setAnalyzingReportId(null);
    }
  }

  function downloadMedicalReport(report) {
    try {
      const doc = new jsPDF();

      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const textWidth =
        doc.internal.pageSize.getWidth() - margin * 2;

      let y = 22;

      function ensureSpace(height) {
        if (y + height > pageHeight - 20) {
          doc.addPage();
          y = 22;
        }
      }

      function addField(label, value) {
        const content =
          value === null ||
          value === undefined ||
          value === ""
            ? "Not specified"
            : String(value);

        ensureSpace(20);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(label, margin, y);
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        const safeContent = content
          .normalize("NFKD")
          .replace(/[^\x20-\x7E\n]/g, "?");

        const lines = doc.splitTextToSize(
          safeContent,
          textWidth
        );

        for (const line of lines) {
          ensureSpace(7);
          doc.text(line || " ", margin, y);
          y += 6;
        }

        y += 7;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(21);
      doc.setTextColor(13, 115, 110);
      doc.text("MediConnect+", margin, y);

      y += 12;

      doc.setFontSize(15);
      doc.setTextColor(30, 41, 59);
      doc.text(
        "Doctor-Issued Medical Report",
        margin,
        y
      );

      y += 6;

      doc.setDrawColor(13, 148, 136);
      doc.line(
        margin,
        y,
        margin + textWidth,
        y
      );

      y += 13;

      addField("Patient Name", user?.name);
      addField("Patient ID", user?.id);
      addField(
        "Doctor Name",
        report.doctorName || "Doctor"
      );
      addField(
        "Appointment ID",
        report.appointmentId
      );
      addField(
        "Report Date",
        formatReportDate(report.createdAt)
      );
      addField("Symptoms", report.symptoms);
      addField("Diagnosis", report.diagnosis);
      addField("Medicines", report.medicines);
      addField("Doctor's Advice", report.advice);

      doc.save(`MediConnect_Report_${report.id}.pdf`);
    } catch (err) {
      setReportError(
        err.message || "Unable to download medical report"
      );
    }
  }

  const sortedReports = [...medicalReports].sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime()
  );

  const upcomingAppointments = appointments.filter(
    (appointment) =>
      !["cancelled", "completed"].includes(
        String(appointment.status || "").toLowerCase()
      )
  );

  const completedAppointments = appointments.filter(
    (appointment) =>
      String(appointment.status || "").toLowerCase() ===
      "completed"
  );

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f5f8fc",
      color: "#172033",
      fontFamily: "Arial, sans-serif",
    },
    container: {
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "30px 20px",
    },
    card: {
      background: "#ffffff",
      borderRadius: "18px",
      padding: "24px",
      border: "1px solid #e5eaf2",
      boxShadow: "0 5px 20px rgba(0,0,0,0.04)",
    },
    button: {
      background: "#0d9488",
      color: "#ffffff",
      border: "none",
      borderRadius: "10px",
      padding: "11px 17px",
      fontWeight: "600",
      cursor: "pointer",
    },
    secondaryButton: {
      background: "#eef6f6",
      color: "#0f766e",
      border: "1px solid #cce7e4",
      borderRadius: "10px",
      padding: "10px 16px",
      fontWeight: "600",
      cursor: "pointer",
    },
    sectionTitle: {
      fontSize: "24px",
      fontWeight: "700",
      marginBottom: "18px",
    },
  };

  if (loading) {
    return (
      <main
        style={{
          ...styles.page,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h2>Loading your MediConnect+ dashboard...</h2>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      {/* HEADER */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e5eaf2",
          padding: "18px 24px",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "15px",
          }}
        >
          <Link
            href="/"
            style={{
              fontSize: "25px",
              fontWeight: "800",
              color: "#0d9488",
              textDecoration: "none",
            }}
          >
            MediConnect+
          </Link>

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Link href="/" style={{ color: "#334155" }}>
              Home
            </Link>

            <Link
              href="/doctors"
              style={{ color: "#334155" }}
            >
              Find Doctors
            </Link>

            <button
              onClick={logout}
              style={{
                ...styles.secondaryButton,
                color: "#dc2626",
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div style={styles.container}>
        {/* WELCOME */}
        <section
          style={{
            ...styles.card,
            background:
              "linear-gradient(135deg,#0f766e,#14b8a6)",
            color: "#ffffff",
            marginBottom: "25px",
          }}
        >
          <h1
            style={{
              fontSize: "30px",
              fontWeight: "800",
              marginBottom: "10px",
            }}
          >
            Welcome, {user?.name || "Patient"}!
          </h1>

          <p>
            Manage your appointments, medical reports,
            and AI-powered healthcare assistance.
          </p>

          <button
            onClick={refreshDashboard}
            disabled={refreshing}
            style={{
              ...styles.button,
              background: "#ffffff",
              color: "#0f766e",
              marginTop: "15px",
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh Dashboard"}
          </button>
        </section>

        {error && (
          <div
            role="alert"
            style={{
              padding: "15px",
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: "10px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        {/* DASHBOARD STATISTICS */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(200px,1fr))",
            gap: "18px",
            marginBottom: "30px",
          }}
        >
          {[
            {
              title: "Total Appointments",
              value: appointments.length,
              icon: "📅",
            },
            {
              title: "Upcoming Appointments",
              value: upcomingAppointments.length,
              icon: "⏰",
            },
            {
              title: "Completed Appointments",
              value: completedAppointments.length,
              icon: "✅",
            },
            {
              title: "Medical Reports",
              value: medicalReports.length,
              icon: "📋",
            },
          ].map((item) => (
            <div key={item.title} style={styles.card}>
              <div style={{ fontSize: "30px" }}>
                {item.icon}
              </div>

              <h3
                style={{
                  fontSize: "14px",
                  color: "#64748b",
                  marginTop: "12px",
                }}
              >
                {item.title}
              </h3>

              <p
                style={{
                  fontSize: "30px",
                  fontWeight: "800",
                  marginTop: "8px",
                }}
              >
                {item.value}
              </p>
            </div>
          ))}
        </section>

        {/* MY MEDICAL REPORTS */}
        <section
          id="medical-reports"
          style={{ marginBottom: "35px" }}
        >
          <h2 style={styles.sectionTitle}>
            📋 My Medical Reports
          </h2>

          <p
            style={{
              color: "#64748b",
              marginBottom: "20px",
            }}
          >
            View reports created by your doctor,
            download them, or understand them with Gemini AI.
            No file upload is required for saved reports.
          </p>

          {reportError && (
            <div
              role="alert"
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "14px",
                borderRadius: "10px",
                marginBottom: "18px",
              }}
            >
              {reportError}
            </div>
          )}

          {sortedReports.length === 0 ? (
            <div style={styles.card}>
              <h3>No medical reports available</h3>

              <p
                style={{
                  color: "#64748b",
                  marginTop: "10px",
                }}
              >
                After your consultation, your doctor
                can create a medical report. It will
                appear here automatically when you refresh.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "20px",
              }}
            >
              {sortedReports.map((report) => (
                <article
                  key={report.id}
                  style={styles.card}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "15px",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: "20px",
                          fontWeight: "700",
                          marginBottom: "8px",
                        }}
                      >
                        Medical Report #{report.id}
                      </h3>

                      <p
                        style={{
                          color: "#475569",
                          marginBottom: "5px",
                        }}
                      >
                        Doctor: {report.doctorName || "Not specified"}
                      </p>

                      <p
                        style={{
                          color: "#475569",
                          marginBottom: "5px",
                        }}
                      >
                        Appointment ID: {report.appointmentId}
                      </p>

                      <p
                        style={{
                          color: "#64748b",
                          fontSize: "14px",
                        }}
                      >
                        Issued: {formatReportDate(report.createdAt)}
                      </p>
                    </div>

                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#166534",
                        padding: "7px 12px",
                        borderRadius: "20px",
                        fontSize: "13px",
                        fontWeight: "600",
                      }}
                    >
                      Doctor Issued
                    </span>
                  </div>

                  {/* REPORT ACTION BUTTONS */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginTop: "20px",
                    }}
                  >
                    <button
                      style={styles.secondaryButton}
                      onClick={() =>
                        setSelectedReportId(
                          selectedReportId === report.id
                            ? null
                            : report.id
                        )
                      }
                    >
                      {selectedReportId === report.id
                        ? "Hide Report"
                        : "View Report"}
                    </button>

                    <button
                      style={styles.secondaryButton}
                      onClick={() =>
                        downloadMedicalReport(report)
                      }
                    >
                      📥 Download PDF
                    </button>

                    <button
                      style={{
                        ...styles.button,
                        opacity:
                          analyzingReportId !== null
                            ? 0.65
                            : 1,
                      }}
                      onClick={() =>
                        analyzeSavedReport(report)
                      }
                      disabled={analyzingReportId !== null}
                    >
                      {analyzingReportId === report.id
                        ? "✨ Gemini is analyzing..."
                        : "✨ Analyze with AI"}
                    </button>
                  </div>

                  {/* EXPANDED DOCTOR REPORT */}
                  {selectedReportId === report.id && (
                    <div
                      style={{
                        marginTop: "22px",
                        padding: "20px",
                        background: "#f8fafc",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "18px",
                          fontWeight: "700",
                          marginBottom: "15px",
                        }}
                      >
                        Doctor's Medical Report
                      </h3>

                      {[
                        ["Symptoms", report.symptoms],
                        ["Diagnosis", report.diagnosis],
                        ["Medicines", report.medicines],
                        ["Doctor's Advice", report.advice],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          style={{ marginBottom: "15px" }}
                        >
                          <strong>{label}</strong>

                          <p
                            style={{
                              marginTop: "6px",
                              color: "#475569",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {value || "Not specified"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI ERROR */}
                  {aiErrors[report.id] && (
                    <div
                      role="alert"
                      style={{
                        marginTop: "20px",
                        background: "#fee2e2",
                        color: "#991b1b",
                        padding: "15px",
                        borderRadius: "10px",
                      }}
                    >
                      {aiErrors[report.id]}
                    </div>
                  )}

                  {/* GEMINI AI EXPLANATION */}
                  {aiResults[report.id] && (
                    <div
                      style={{
                        marginTop: "22px",
                        padding: "22px",
                        background: "#f0fdfa",
                        border: "1px solid #99f6e4",
                        borderRadius: "14px",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "21px",
                          fontWeight: "700",
                          color: "#0f766e",
                          marginBottom: "15px",
                        }}
                      >
                        ✨ Gemini AI Report Explanation
                      </h3>

                      <div
                        style={{
                          whiteSpace: "pre-wrap",
                          lineHeight: "1.9",
                          fontSize: "15px",
                          color: "#334155",
                        }}
                      >
                        {aiResults[report.id]}
                      </div>

                      <p
                        style={{
                          marginTop: "18px",
                          paddingTop: "12px",
                          borderTop: "1px solid #99f6e4",
                          fontSize: "13px",
                          color: "#64748b",
                        }}
                      >
                        This AI explanation is educational
                        and does not replace medical advice,
                        diagnosis, or treatment from a doctor.
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* MY APPOINTMENTS */}
        <section
          id="appointments"
          style={{ marginBottom: "35px" }}
        >
          <h2 style={styles.sectionTitle}>
            📅 My Appointments
          </h2>

          {appointments.length === 0 ? (
            <div style={styles.card}>
              <h3>No appointments found</h3>
              <p
                style={{
                  color: "#64748b",
                  marginTop: "10px",
                }}
              >
                You have not booked any appointments yet.
              </p>

              <Link
                href="/doctors"
                style={{
                  ...styles.button,
                  display: "inline-block",
                  textDecoration: "none",
                  marginTop: "15px",
                }}
              >
                Book Appointment
              </Link>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              {appointments.map((appointment) => {
                const doctor = doctors.find(
                  (item) =>
                    String(item.id) ===
                    String(appointment.doctorId)
                );

                const status = String(
                  appointment.status || "Pending"
                );

                return (
                  <article
                    key={appointment.id}
                    style={styles.card}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        gap: "15px",
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            fontSize: "19px",
                            fontWeight: "700",
                            marginBottom: "10px",
                          }}
                        >
                          {appointment.doctorName ||
                            doctor?.name ||
                            "Doctor"}
                        </h3>

                        <p
                          style={{
                            color: "#64748b",
                            marginBottom: "7px",
                          }}
                        >
                          Specialty:{" "}
                          {appointment.specialty ||
                            doctor?.specialty ||
                            "General Consultation"}
                        </p>

                        <p
                          style={{
                            color: "#475569",
                            marginBottom: "7px",
                          }}
                        >
                          📆 Date:{" "}
                          {formatDate(
                            appointment.appointmentDate ||
                              appointment.date
                          )}
                        </p>

                        <p
                          style={{
                            color: "#475569",
                            marginBottom: "7px",
                          }}
                        >
                          🕒 Time:{" "}
                          {formatTime(
                            appointment.appointmentTime ||
                              appointment.time
                          )}
                        </p>

                        <p
                          style={{
                            color: "#64748b",
                            fontSize: "13px",
                          }}
                        >
                          Appointment ID: {appointment.id}
                        </p>
                      </div>

                      <span
                        style={{
                          background:
                            status.toLowerCase() ===
                            "completed"
                              ? "#dcfce7"
                              : status.toLowerCase() ===
                                  "cancelled"
                                ? "#fee2e2"
                                : "#fef3c7",
                          color:
                            status.toLowerCase() ===
                            "completed"
                              ? "#166534"
                              : status.toLowerCase() ===
                                  "cancelled"
                                ? "#991b1b"
                                : "#92400e",
                          padding: "8px 13px",
                          borderRadius: "20px",
                          fontSize: "13px",
                          fontWeight: "700",
                          textTransform: "capitalize",
                        }}
                      >
                        {status}
                      </span>
                    </div>

                    {status.toLowerCase() === "completed" && (
                      <p
                        style={{
                          marginTop: "15px",
                          padding: "12px",
                          background: "#f0fdfa",
                          borderRadius: "10px",
                          color: "#0f766e",
                          fontSize: "14px",
                        }}
                      >
                        Consultation completed. If your doctor
                        has issued a medical report, you can
                        view and analyze it in My Medical
                        Reports above.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* AVAILABLE DOCTORS */}
        <section
          id="doctors"
          style={{ marginBottom: "35px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <h2
              style={{
                ...styles.sectionTitle,
                marginBottom: 0,
              }}
            >
              🩺 Available Doctors
            </h2>

            <Link
              href="/doctors"
              style={{
                color: "#0f766e",
                fontWeight: "700",
                textDecoration: "none",
              }}
            >
              View All Doctors →
            </Link>
          </div>

          {doctors.length === 0 ? (
            <div style={styles.card}>
              <p>No doctors are available at the moment.</p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(250px,1fr))",
                gap: "18px",
              }}
            >
              {doctors.slice(0, 6).map((doctor) => (
                <div
                  key={doctor.id}
                  style={styles.card}
                >
                  <div
                    style={{
                      width: "55px",
                      height: "55px",
                      borderRadius: "50%",
                      background: "#ccfbf1",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: "27px",
                      marginBottom: "14px",
                    }}
                  >
                    🩺
                  </div>

                  <h3
                    style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      marginBottom: "8px",
                    }}
                  >
                    {doctor.name || "Doctor"}
                  </h3>

                  <p
                    style={{
                      color: "#0f766e",
                      fontWeight: "600",
                      marginBottom: "8px",
                    }}
                  >
                    {doctor.specialty ||
                      "General Consultation"}
                  </p>

                  {doctor.experience && (
                    <p
                      style={{
                        color: "#64748b",
                        marginBottom: "8px",
                      }}
                    >
                      Experience: {doctor.experience}
                    </p>
                  )}

                  {doctor.fee !== undefined &&
                    doctor.fee !== null && (
                      <p
                        style={{
                          color: "#334155",
                          fontWeight: "600",
                          marginBottom: "14px",
                        }}
                      >
                        Consultation Fee: ₹{doctor.fee}
                      </p>
                    )}

                  <Link
                    href="/doctors"
                    style={{
                      ...styles.button,
                      display: "inline-block",
                      textDecoration: "none",
                    }}
                  >
                    Book Appointment
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* AI MEDICAL REPORT UPLOAD */}
        <section
          id="ai-report-analysis"
          style={{ marginBottom: "35px" }}
        >
          <div
            style={{
              ...styles.card,
              background:
                "linear-gradient(135deg,#ecfeff,#f0fdfa)",
              border: "1px solid #99f6e4",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "16px",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  borderRadius: "15px",
                  background: "#ccfbf1",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: "30px",
                }}
              >
                ✨
              </div>

              <div style={{ flex: 1, minWidth: "220px" }}>
                <h2
                  style={{
                    fontSize: "23px",
                    fontWeight: "800",
                    marginBottom: "12px",
                  }}
                >
                  AI Medical Report Analysis
                </h2>

                <p
                  style={{
                    color: "#475569",
                    lineHeight: "1.8",
                    marginBottom: "16px",
                  }}
                >
                  Upload a medical report in PDF, JPG,
                  JPEG, or PNG format and receive an
                  easy-to-understand explanation using
                  Gemini AI.
                </p>

                <p
                  style={{
                    color: "#0f766e",
                    fontSize: "14px",
                    marginBottom: "18px",
                  }}
                >
                  For reports already created by your
                  MediConnect+ doctor, use the
                  "Analyze with AI" button in
                  My Medical Reports instead.
                  No upload is required.
                </p>

                <Link
                  href="/report-analysis"
                  style={{
                    ...styles.button,
                    display: "inline-block",
                    textDecoration: "none",
                  }}
                >
                  Upload & Analyze Report →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* PATIENT PROFILE */}
        <section
          id="profile"
          style={{ marginBottom: "35px" }}
        >
          <h2 style={styles.sectionTitle}>
            👤 My Profile
          </h2>

          <div style={styles.card}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "15px",
                marginBottom: "22px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: "65px",
                  height: "65px",
                  borderRadius: "50%",
                  background: "#ccfbf1",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: "30px",
                }}
              >
                👤
              </div>

              <div>
                <h3
                  style={{
                    fontSize: "21px",
                    fontWeight: "700",
                  }}
                >
                  {user?.name || "Patient"}
                </h3>

                <p
                  style={{
                    color: "#64748b",
                    marginTop: "5px",
                  }}
                >
                  MediConnect+ Patient Account
                </p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(220px,1fr))",
                gap: "20px",
              }}
            >
              {[
                {
                  label: "Full Name",
                  value: user?.name,
                },
                {
                  label: "Email Address",
                  value: user?.email,
                },
                {
                  label: "Patient ID",
                  value: user?.id,
                },
                {
                  label: "Account Type",
                  value: "Patient",
                },
              ].map((field) => (
                <div key={field.label}>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#64748b",
                      marginBottom: "7px",
                    }}
                  >
                    {field.label}
                  </p>

                  <p
                    style={{
                      fontWeight: "600",
                      color: "#172033",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {field.value ?? "Not available"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer
          style={{
            textAlign: "center",
            padding: "25px 10px",
            color: "#64748b",
            fontSize: "13px",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <p>
            © {new Date().getFullYear()} MediConnect+.
            AI-powered healthcare assistance.
          </p>

          <p style={{ marginTop: "8px" }}>
            AI explanations are for educational purposes
            only and do not replace professional medical
            advice.
          </p>
        </footer>
      </div>
    </main>
  );
}
