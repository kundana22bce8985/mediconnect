
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  clearAuth,
  formBody,
  getAuth,
} from "../../lib/mediconnectAuth";

const REFRESH_INTERVAL = 5000;

function clock(value) {
  if (!value) return "";

  const [h, m] = String(value).split(":").map(Number);

  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${
    h >= 12 ? "PM" : "AM"
  }`;
}

function statusStyle(status) {
  switch (String(status || "").toLowerCase()) {
    case "booked":
      return "bg-green-100 text-green-700";

    case "completed":
      return "bg-blue-100 text-blue-700";

    case "cancelled":
      return "bg-red-100 text-red-700";

    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function MyAppointments() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const requestInProgress = useRef(false);
  const mutationInProgress = useRef(false);
  const mounted = useRef(false);

  // ==========================================
  // LOAD APPOINTMENTS
  // ==========================================

  const loadAppointments = useCallback(
    async ({ silent = false } = {}) => {
      if (
        requestInProgress.current ||
        mutationInProgress.current
      ) {
        return;
      }

      if (!getAuth()?.token) {
        router.replace("/login");
        return;
      }

      requestInProgress.current = true;

      try {
        const data = await api("/api/appointments");

        if (!mounted.current) return;

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.appointments)
          ? data.appointments
          : [];

        setAppointments(list);

        if (!silent) {
          setError("");
        }
      } catch (err) {
        if (!mounted.current) return;

        if (!getAuth()?.token) {
          router.replace("/login");
          return;
        }

        if (silent) {
          console.error(
            "Automatic appointment refresh failed:",
            err
          );
        } else {
          setError(
            err.message || "Unable to load appointments."
          );
        }
      } finally {
        requestInProgress.current = false;
      }
    },
    [router]
  );

  // ==========================================
  // INITIAL PAGE LOAD
  // ==========================================

  useEffect(() => {
    mounted.current = true;
    let active = true;

    async function init() {
      if (!getAuth()?.token) {
        router.replace("/login");
        return;
      }

      try {
        const [me, as, ds] = await Promise.all([
          api("/api/me"),
          api("/api/appointments"),
          api("/api/doctors"),
        ]);

        if (!active) return;

        setUser(me);

        setAppointments(
          Array.isArray(as)
            ? as
            : Array.isArray(as?.appointments)
            ? as.appointments
            : []
        );

        setDoctors(Array.isArray(ds) ? ds : []);
        setError("");
      } catch (err) {
        if (!active) return;

        setError(
          err.message || "Unable to load appointments."
        );

        if (!getAuth()?.token) {
          router.replace("/login");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      active = false;
      mounted.current = false;
    };
  }, [router]);

  // ==========================================
  // AUTOMATIC REFRESH EVERY 5 SECONDS
  // ==========================================

  useEffect(() => {
    if (loading || !user) return;

    let active = true;

    async function autoRefresh() {
      if (!active || document.hidden) return;

      await loadAppointments({ silent: true });
    }

    const interval = setInterval(
      autoRefresh,
      REFRESH_INTERVAL
    );

    function onVisibilityChange() {
      if (!document.hidden) {
        autoRefresh();
      }
    }

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange
    );

    return () => {
      active = false;
      clearInterval(interval);

      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
      );
    };
  }, [loading, user, loadAppointments]);

  // ==========================================
  // MANUAL REFRESH
  // ==========================================

  async function refresh() {
    if (refreshing) return;

    setRefreshing(true);
    setError("");
    setMessage("");

    try {
      await loadAppointments();
    } finally {
      setRefreshing(false);
    }
  }

  // ==========================================
  // CANCEL APPOINTMENT
  // ==========================================

  async function cancel(id) {
    if (mutationInProgress.current) return;

    if (!window.confirm("Cancel this appointment?")) {
      return;
    }

    mutationInProgress.current = true;

    setCancelling(id);
    setError("");
    setMessage("");

    try {
      await api("/api/appointments", {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: formBody({
          appointmentId: String(id),
        }),
      });

      setAppointments((old) =>
        old.map((appointment) =>
          String(appointment.id) === String(id)
            ? {
                ...appointment,
                status: "Cancelled",
              }
            : appointment
        )
      );

      setMessage(
        "Appointment cancelled successfully."
      );
    } catch (err) {
      setError(
        err.message || "Unable to cancel appointment."
      );
    } finally {
      mutationInProgress.current = false;
      setCancelling(null);
    }
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  async function logout() {
    try {
      await api("/api/logout", {
        method: "POST",
      });
    } catch {
      // Clear local session if server is unavailable.
    }

    clearAuth();
    router.replace("/login");
  }

  // ==========================================
  // APPOINTMENT STATISTICS
  // ==========================================

  const mine = appointments.filter(
    (appointment) => appointment.mine === true
  );

  const bookedCount = mine.filter(
    (a) =>
      String(a.status).toLowerCase() === "booked"
  ).length;

  const completedCount = mine.filter(
    (a) =>
      String(a.status).toLowerCase() === "completed"
  ).length;

  const cancelledCount = mine.filter(
    (a) =>
      String(a.status).toLowerCase() === "cancelled"
  ).length;

  // ==========================================
  // LOADING SCREEN
  // ==========================================

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-xl font-semibold text-teal-700">
          Loading your appointments...
        </p>
      </main>
    );
  }

  // ==========================================
  // PAGE DESIGN
  // ==========================================

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">

      {/* HEADER */}

      <header className="bg-white border-b">
        <nav className="max-w-5xl mx-auto p-6 flex flex-wrap justify-between items-center gap-4">

          <Link
            href="/"
            className="text-2xl font-bold text-teal-700"
          >
            MediConnect+
          </Link>

          <div className="flex gap-3 items-center">

            <Link
              href="/appointments/book"
              className="text-teal-700 font-semibold"
            >
              Book Appointment
            </Link>

            <button
              onClick={logout}
              className="bg-slate-900 text-white rounded-lg px-4 py-2"
            >
              Logout
            </button>

          </div>
        </nav>
      </header>

      {/* HERO */}

      <section className="bg-gradient-to-r from-teal-700 to-cyan-600 text-white p-12">
        <div className="max-w-5xl mx-auto">

          <h1 className="text-4xl font-bold">
            My Appointments
          </h1>

          <p className="mt-3">
            {user
              ? `Welcome, ${user.name}`
              : "Your appointment history"}
          </p>

        </div>
      </section>

      {/* CONTENT */}

      <section className="max-w-5xl mx-auto px-6 py-10">

        {/* APPOINTMENT COUNTS */}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">

          {[
            {
              title: "Total",
              value: mine.length,
            },
            {
              title: "Booked",
              value: bookedCount,
            },
            {
              title: "Completed",
              value: completedCount,
            },
            {
              title: "Cancelled",
              value: cancelledCount,
            },
          ].map((item) => (

            <div
              key={item.title}
              className="bg-white border rounded-xl p-5 shadow-sm"
            >

              <p className="text-slate-500 text-sm">
                {item.title}
              </p>

              <h3 className="text-3xl font-bold text-teal-700 mt-2">
                {item.value}
              </h3>

            </div>
          ))}

        </div>

        {/* APPOINTMENT HISTORY HEADER */}

        <div className="flex flex-wrap justify-between gap-3 items-center mb-8">

          <h2 className="text-2xl font-bold">
            Appointment History
          </h2>

          <div className="flex gap-3">

            <button
              disabled={refreshing}
              onClick={refresh}
              className="border border-teal-600 text-teal-700 px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>

            <Link
              href="/appointments/book"
              className="bg-teal-600 text-white px-4 py-2 rounded-lg"
            >
              + Book New
            </Link>

          </div>
        </div>

        {/* ERROR MESSAGE */}

        {error && (
          <p
            role="alert"
            className="bg-red-50 text-red-700 p-4 rounded-xl mb-5"
          >
            {error}
          </p>
        )}

        {/* SUCCESS MESSAGE */}

        {message && (
          <p
            role="status"
            className="bg-green-50 text-green-700 p-4 rounded-xl mb-5"
          >
            {message}
          </p>
        )}

        {/* APPOINTMENTS LIST */}

        {mine.length === 0 ? (

          <div className="bg-white border rounded-2xl p-10 text-center">

            <h3 className="text-xl font-bold">
              No Appointments Found
            </h3>

            <p className="mt-2 text-slate-600">
              Book your first consultation to see it here.
            </p>

            <Link
              href="/appointments/book"
              className="inline-block mt-5 bg-teal-600 text-white px-5 py-3 rounded-lg"
            >
              Book Appointment
            </Link>

          </div>

        ) : (

          <div className="space-y-5">

            {mine.map((appointment) => {

              const doctor = doctors.find(
                (d) =>
                  Number(d.id) ===
                  Number(appointment.doctorId)
              );

              const status = String(
                appointment.status || ""
              ).toLowerCase();

              return (

                <article
                  key={appointment.id}
                  className="bg-white border rounded-2xl shadow-sm p-7"
                >

                  <div className="flex justify-between items-start gap-3">

                    <div>

                      <h3 className="text-xl font-bold">
                        {appointment.doctorName ||
                          doctor?.name ||
                          "Doctor"}
                      </h3>

                      <p className="text-slate-600">
                        {doctor?.specialty || "Consultation"}
                      </p>

                      <p className="text-slate-500 text-sm">
                        Appointment #{appointment.id}
                      </p>

                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${statusStyle(
                        appointment.status
                      )}`}
                    >
                      {appointment.status}
                    </span>

                  </div>

                  <div className="space-y-2 mt-5 text-slate-700">

                    <p>
                      <strong>Patient:</strong>{" "}
                      {appointment.patientName}
                    </p>

                    <p>
                      <strong>Date:</strong>{" "}
                      {appointment.date}
                    </p>

                    <p>
                      <strong>Time:</strong>{" "}
                      {clock(appointment.time)}
                    </p>

                    <p>
                      <strong>Fee:</strong> ₹
                      {doctor?.fee ?? "N/A"}
                    </p>

                  </div>

                  {/* BOOKED */}

                  {status === "booked" && (

                    <button
                      disabled={cancelling !== null}
                      onClick={() =>
                        cancel(appointment.id)
                      }
                      className="mt-6 bg-red-50 text-red-700 rounded-lg px-5 py-3 hover:bg-red-100 disabled:opacity-50"
                    >
                      {cancelling === appointment.id
                        ? "Cancelling..."
                        : "Cancel Appointment"}
                    </button>

                  )}

                  {/* COMPLETED */}

                  {status === "completed" && (

                    <p className="mt-5 text-blue-700 font-medium">
                      Your consultation has been completed.
                    </p>

                  )}

                  {/* CANCELLED */}

                  {status === "cancelled" && (

                    <p className="mt-5 text-red-600 font-medium">
                      This appointment was cancelled.
                    </p>

                  )}

                </article>
              );
            })}

          </div>
        )}

      </section>

    </main>
  );
}
