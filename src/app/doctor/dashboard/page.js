
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL = "http://localhost:8080";
const AUTH_KEY = "mediconnect_doctor_auth";

const EMPTY_REPORT = {
  symptoms: "",
  diagnosis: "",
  medicines: "",
  advice: "",
};

export default function DoctorDashboard() {
  const router = useRouter();

  const [doctor, setDoctor] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [completingId, setCompletingId] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const [selectedAppointment, setSelectedAppointment] =
    useState(null);
  const [reportForm, setReportForm] = useState(EMPTY_REPORT);
  const [savingReport, setSavingReport] = useState(false);
  const [viewReport, setViewReport] = useState(null);

  const requestInProgress = useRef(false);
  const loggedOut = useRef(false);

  const getToken = useCallback(() => {
    try {
      const saved = sessionStorage.getItem(AUTH_KEY);
      return saved ? JSON.parse(saved)?.token : null;
    } catch {
      return null;
    }
  }, []);

  const clearSession = useCallback(() => {
    if (loggedOut.current) return;
    loggedOut.current = true;
    sessionStorage.removeItem(AUTH_KEY);
    router.replace("/doctor/login");
  }, [router]);

  const apiRequest = useCallback(
    async (path, options = {}) => {
      const token = getToken();

      if (!token) {
        clearSession();
        throw new Error("Please log in again.");
      }

      let response;

      try {
        response = await fetch(`${API_URL}${path}`, {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
          },
          cache: "no-store",
        });
      } catch {
        throw new Error(
          "Cannot connect to Java backend on port 8080."
        );
      }

      if (response.status === 401) {
        clearSession();
        throw new Error("Session expired. Please log in again.");
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed (${response.status})`
        );
      }

      return data;
    },
    [getToken, clearSession]
  );

  const loadAppointments = useCallback(
    async (silent = false) => {
      if (requestInProgress.current || loggedOut.current) return;

      requestInProgress.current = true;

      try {
        const data = await apiRequest(
          "/api/doctor/appointments"
        );

        setAppointments(
          Array.isArray(data)
            ? data
            : Array.isArray(data.appointments)
            ? data.appointments
            : []
        );

        if (!silent) setError("");
      } catch (err) {
        if (!silent && !loggedOut.current) {
          setError(err.message);
        }
      } finally {
        requestInProgress.current = false;
      }
    },
    [apiRequest]
  );

  const loadReports = useCallback(async () => {
    if (loggedOut.current) return;

    setReportsLoading(true);

    try {
      const data = await apiRequest("/api/doctor/reports");

      setReports(
        Array.isArray(data)
          ? data
          : Array.isArray(data.reports)
          ? data.reports
          : []
      );
    } catch (err) {
      if (!loggedOut.current) setError(err.message);
    } finally {
      setReportsLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const profile = await apiRequest("/api/doctor/me");

        if (cancelled) return;

        setDoctor(profile.doctor || profile);
        await Promise.all([
          loadAppointments(),
          loadReports(),
        ]);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [apiRequest, loadAppointments, loadReports]);

  useEffect(() => {
    if (loading || !doctor) return;

    const interval = setInterval(() => {
      if (!document.hidden && !loggedOut.current) {
        loadAppointments(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [loading, doctor, loadAppointments]);

  async function refreshAll() {
    setError("");
    setMessage("");

    await Promise.all([
      loadAppointments(),
      loadReports(),
    ]);
  }

  async function markCompleted(appointmentId) {
    if (completingId !== null) return;

    if (
      !window.confirm(
        "Has this consultation been completed?"
      )
    ) {
      return;
    }

    setCompletingId(appointmentId);
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        "/api/doctor/appointments/complete",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            appointmentId: String(appointmentId),
          }).toString(),
        }
      );

      setAppointments((previous) =>
        previous.map((a) =>
          String(a.id) === String(appointmentId)
            ? { ...a, status: "Completed" }
            : a
        )
      );

      setMessage(
        data.message || "Appointment marked as Completed."
      );

      await loadAppointments(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setCompletingId(null);
    }
  }

  function openReportForm(appointment) {
    setSelectedAppointment(appointment);
    setReportForm({ ...EMPTY_REPORT });
    setViewReport(null);
    setError("");
    setMessage("");

    setTimeout(() => {
      document
        .getElementById("create-report")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  function updateReportField(event) {
    const { name, value } = event.target;

    setReportForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function submitReport(event) {
    event.preventDefault();

    if (!selectedAppointment || savingReport) return;

    if (!reportForm.symptoms.trim()) {
      setError("Please enter the patient's symptoms.");
      return;
    }

    if (
      !window.confirm(
        "Have you reviewed this report and are you ready to issue it to the patient?"
      )
    ) {
      return;
    }

    setSavingReport(true);
    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        "/api/doctor/reports",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            appointmentId: String(selectedAppointment.id),
            symptoms: reportForm.symptoms.trim(),
            diagnosis: reportForm.diagnosis.trim(),
            medicines: reportForm.medicines.trim(),
            advice: reportForm.advice.trim(),
          }).toString(),
        }
      );

      setSelectedAppointment(null);
      setReportForm({ ...EMPTY_REPORT });

      setMessage(
        data.message ||
          "Medical report created successfully."
      );

      await loadReports();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingReport(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    loggedOut.current = true;

    const token = getToken();
    sessionStorage.removeItem(AUTH_KEY);

    try {
      if (token) {
        await fetch(`${API_URL}/api/doctor/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Local session is already cleared.
    } finally {
      window.location.replace("/doctor/login");
    }
  }

  const booked = appointments.filter(
    (a) => a.status?.toLowerCase() === "booked"
  );

  const completed = appointments.filter(
    (a) => a.status?.toLowerCase() === "completed"
  );

  const cancelled = appointments.filter(
    (a) => a.status?.toLowerCase() === "cancelled"
  );

  const today = new Date().toLocaleDateString("en-CA");

  const todayAppointments = booked.filter(
    (a) => String(a.date || "").slice(0, 10) === today
  );

  const reportedIds = new Set(
    reports.map((r) => String(r.appointmentId))
  );

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-xl font-semibold text-teal-700">
          Loading Doctor Dashboard...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap justify-between items-center gap-4">
          <Link
            href="/"
            className="text-2xl font-bold text-teal-700"
          >
            MediConnect+
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#patient-reports"
              className="px-4 py-2 rounded-lg bg-teal-50 text-teal-700 font-semibold"
            >
              Medical Reports
            </a>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-50"
            >
              {loggingOut ? "Logging Out..." : "Logout"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* MESSAGES */}
        {error && (
          <div
            role="alert"
            className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-200"
          >
            {message}
          </div>
        )}

        {/* DOCTOR PROFILE */}
        <section className="bg-gradient-to-r from-teal-700 to-cyan-600 rounded-2xl p-8 text-white">
          <p className="text-teal-100 mb-2">
            Doctor Portal
          </p>

          <h2 className="text-3xl font-bold">
            Welcome, {doctor?.name || "Doctor"}
          </h2>

          <p className="mt-2 text-lg">
            {doctor?.specialty || "Medical Professional"}
          </p>

          <p className="mt-1 text-sm text-teal-100">
            {doctor?.email || ""}
          </p>
        </section>

        {/* STATISTICS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {[
            {
              title: "Total Appointments",
              value: appointments.length,
            },
            {
              title: "Booked Appointments",
              value: booked.length,
            },
            {
              title: "Today's Appointments",
              value: todayAppointments.length,
            },
            {
              title: "Completed",
              value: completed.length,
            },
            {
              title: "Cancelled",
              value: cancelled.length,
            },
          ].map((stat) => (
            <div
              key={stat.title}
              className="bg-white p-6 rounded-xl border shadow-sm"
            >
              <p className="text-slate-500 text-sm">
                {stat.title}
              </p>

              <h3 className="text-3xl font-bold text-teal-700 mt-3">
                {stat.value}
              </h3>
            </div>
          ))}
        </section>

        {/* PATIENT APPOINTMENTS */}
        <section className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-6 border-b flex flex-wrap justify-between items-center gap-4">
            <div>
              <h3 className="text-xl font-bold">
                Patient Appointments
              </h3>

              <p className="text-slate-500 text-sm mt-1">
                View and manage appointments assigned to you.
              </p>
            </div>

            <button
              type="button"
              onClick={refreshAll}
              className="bg-teal-700 hover:bg-teal-800 text-white px-5 py-2 rounded-lg font-semibold"
            >
              Refresh
            </button>
          </div>

          {appointments.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              No appointments found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-4">Patient</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Time</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {appointments.map((a, index) => {
                    const status = (
                      a.status || ""
                    ).toLowerCase();

                    const isBooked = status === "booked";
                    const isCompleted =
                      status === "completed";
                    const isCancelled =
                      status === "cancelled";

                    const hasReport = reportedIds.has(
                      String(a.id)
                    );

                    return (
                      <tr
                        key={a.id ?? index}
                        className="border-t hover:bg-slate-50"
                      >
                        <td className="p-4 font-medium">
                          {a.patientName || "Patient"}
                        </td>

                        <td className="p-4">
                          {a.patientEmail || "-"}
                        </td>

                        <td className="p-4">
                          {a.date || "-"}
                        </td>

                        <td className="p-4">
                          {a.time || "-"}
                        </td>

                        <td className="p-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              isBooked
                                ? "bg-green-100 text-green-700"
                                : isCompleted
                                ? "bg-blue-100 text-blue-700"
                                : isCancelled
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {a.status || "Unknown"}
                          </span>
                        </td>

                        <td className="p-4">
                          {isBooked ? (
                            <button
                              type="button"
                              onClick={() =>
                                markCompleted(a.id)
                              }
                              disabled={
                                completingId !== null
                              }
                              className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                            >
                              {completingId === a.id
                                ? "Updating..."
                                : "Mark as Completed"}
                            </button>
                          ) : isCompleted ? (
                            hasReport ? (
                              <span className="text-green-700 font-semibold">
                                Report Created
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  openReportForm(a)
                                }
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                              >
                                Create Medical Report
                              </button>
                            )
                          ) : isCancelled ? (
                            <span className="text-slate-400">
                              Cancelled
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              No action
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* CREATE MEDICAL REPORT FORM */}
        {selectedAppointment && (
          <section
            id="create-report"
            className="bg-white rounded-2xl border shadow-sm overflow-hidden"
          >
            <div className="p-6 border-b bg-teal-50">
              <h3 className="text-xl font-bold text-teal-800">
                Create Medical Report
              </h3>

              <p className="mt-2 text-slate-600">
                Patient:{" "}
                <strong>
                  {selectedAppointment.patientName}
                </strong>
              </p>

              <p className="text-sm text-slate-500 mt-1">
                Appointment ID: {selectedAppointment.id}
              </p>
            </div>

            <form
              onSubmit={submitReport}
              className="p-6 space-y-5"
            >
              {[
                {
                  name: "symptoms",
                  label: "Symptoms",
                  placeholder:
                    "Enter symptoms and patient complaints",
                  required: true,
                  maxLength: 2000,
                },
                {
                  name: "diagnosis",
                  label: "Diagnosis / Clinical Findings",
                  placeholder:
                    "Enter diagnosis or clinical findings",
                  maxLength: 2000,
                },
                {
                  name: "medicines",
                  label: "Medicines / Prescription",
                  placeholder:
                    "Enter medicines, dosage and instructions",
                  maxLength: 4000,
                },
                {
                  name: "advice",
                  label: "Doctor's Advice / Follow-up",
                  placeholder:
                    "Enter advice and follow-up instructions",
                  maxLength: 4000,
                },
              ].map((field) => (
                <div key={field.name}>
                  <label className="block font-semibold mb-2">
                    {field.label}
                    {field.required && (
                      <span className="text-red-600">
                        {" "}*
                      </span>
                    )}
                  </label>

                  <textarea
                    name={field.name}
                    value={reportForm[field.name]}
                    onChange={updateReportField}
                    required={Boolean(field.required)}
                    maxLength={field.maxLength}
                    rows={3}
                    placeholder={field.placeholder}
                    className="w-full border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              ))}

              <p className="text-sm text-slate-500">
                Review all clinical details before issuing
                the report. Once saved, it becomes
                available to the patient.
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={savingReport}
                  className="bg-teal-700 hover:bg-teal-800 text-white px-6 py-3 rounded-xl font-semibold disabled:opacity-50"
                >
                  {savingReport
                    ? "Saving Report..."
                    : "Save & Issue Medical Report"}
                </button>

                <button
                  type="button"
                  disabled={savingReport}
                  onClick={() => {
                    setSelectedAppointment(null);
                    setReportForm({ ...EMPTY_REPORT });
                  }}
                  className="bg-slate-200 hover:bg-slate-300 px-6 py-3 rounded-xl font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* MEDICAL REPORTS */}
        <section
          id="patient-reports"
          className="bg-white rounded-2xl border shadow-sm overflow-hidden"
        >
          <div className="p-6 border-b flex flex-wrap justify-between items-center gap-4">
            <div>
              <span className="inline-block bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-xs font-bold mb-3">
                Medical Records
              </span>

              <h3 className="text-xl font-bold">
                Medical Reports Issued
              </h3>

              <p className="text-slate-500 text-sm mt-2">
                View medical reports created for your patients.
              </p>
            </div>

            <button
              type="button"
              onClick={loadReports}
              disabled={reportsLoading}
              className="bg-teal-700 hover:bg-teal-800 text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-50"
            >
              {reportsLoading
                ? "Loading..."
                : "Refresh Reports"}
            </button>
          </div>

          {reportsLoading && reports.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              Loading medical reports...
            </div>
          ) : reports.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              No medical reports created yet.
              Complete a consultation and create a report.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-4">Patient</th>
                    <th className="p-4">Appointment</th>
                    <th className="p-4">Created</th>
                    <th className="p-4">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {reports.map((report) => (
                    <tr
                      key={report.id}
                      className="border-t hover:bg-slate-50"
                    >
                      <td className="p-4 font-medium">
                        {report.patientName || "Patient"}
                      </td>

                      <td className="p-4">
                        #{report.appointmentId}
                      </td>

                      <td className="p-4">
                        {report.createdAt || "-"}
                      </td>

                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => {
                            setViewReport(report);
                            setTimeout(() => {
                              document
                                .getElementById("view-report")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                });
                            }, 50);
                          }}
                          className="text-teal-700 font-semibold hover:underline"
                        >
                          View Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* VIEW SAVED REPORT */}
        {viewReport && (
          <section
            id="view-report"
            className="bg-white rounded-2xl border shadow-sm p-6 space-y-5"
          >
            <div className="flex justify-between items-center gap-3">
              <h3 className="text-xl font-bold text-teal-800">
                Medical Report Details
              </h3>

              <button
                type="button"
                onClick={() => setViewReport(null)}
                className="text-red-600 font-semibold"
              >
                Close
              </button>
            </div>

            <p>
              <strong>Patient:</strong>{" "}
              {viewReport.patientName}
            </p>

            <p>
              <strong>Doctor:</strong>{" "}
              {viewReport.doctorName || doctor?.name}
            </p>

            {[
              ["Symptoms", viewReport.symptoms],
              ["Diagnosis / Findings", viewReport.diagnosis],
              ["Medicines", viewReport.medicines],
              ["Doctor's Advice", viewReport.advice],
            ].map(([label, value]) => (
              <div
                key={label}
                className="bg-slate-50 border rounded-xl p-4"
              >
                <h4 className="font-semibold mb-2">
                  {label}
                </h4>

                <p className="text-slate-700 whitespace-pre-wrap">
                  {value || "Not provided"}
                </p>
              </div>
            ))}
          </section>
        )}

        <p className="text-xs text-slate-500 text-center pb-6">
          Medical reports contain confidential patient
          information. Only authorized users should
          access them. AI explanations do not replace
          professional clinical judgment.
        </p>
      </div>
    </main>
  );
}
