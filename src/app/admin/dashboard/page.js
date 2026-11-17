
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = "http://localhost:8080";
const STORAGE_KEY = "mediconnect_admin_auth";

const emptyForm = {
  name: "",
  specialty: "",
  experience: "",
  fee: "",
  email: "",
  password: "",
};

export default function AdminDashboard() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [admin, setAdmin] = useState(null);
  const [doctors, setDoctors] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [modal, setModal] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    router.replace("/admin/login");
  }, [router]);

  const request = useCallback(async (path, authToken, values) => {
    const response = await fetch(`${API}${path}`, {
      method: values ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        ...(values
          ? {
              "Content-Type":
                "application/x-www-form-urlencoded",
            }
          : {}),
      },
      ...(values
        ? {
            body: new URLSearchParams(values).toString(),
          }
        : {}),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("SESSION_EXPIRED");
      }
      throw new Error(data.error || "Request failed");
    }

    return data;
  }, []);

  const loadDoctors = useCallback(
    async (authToken) => {
      const data = await request(
        "/api/admin/doctors",
        authToken
      );

      setDoctors(data);
    },
    [request]
  );

  useEffect(() => {
    async function initialize() {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);

        if (!saved) {
          clearSession();
          return;
        }

        const auth = JSON.parse(saved);

        if (!auth?.token) {
          clearSession();
          return;
        }

        const currentAdmin = await request(
          "/api/admin/me",
          auth.token
        );

        setToken(auth.token);
        setAdmin(currentAdmin);

        await loadDoctors(auth.token);
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [clearSession, request, loadDoctors]);

  function updateForm(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function openModal(type, doctor = null) {
    setModal(type);
    setSelectedDoctor(doctor);
    setForm({
      ...emptyForm,
      email: doctor?.email || "",
    });
    setShowPassword(false);
    setError("");
    setMessage("");
  }

  function closeModal() {
    if (busy) return;
    setModal("");
    setSelectedDoctor(null);
    setForm(emptyForm);
    setError("");
  }

  async function submitForm(e) {
    e.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      let path;
      let values;

      if (modal === "add") {
        path = "/api/admin/doctors/add";
        values = {
          name: form.name.trim(),
          specialty: form.specialty.trim(),
          experience: form.experience.trim(),
          fee: form.fee,
          email: form.email.trim(),
          password: form.password,
        };
      } else if (modal === "create") {
        path = "/api/admin/doctors/create-account";
        values = {
          doctorId: String(selectedDoctor.id),
          email: form.email.trim(),
          password: form.password,
        };
      } else if (modal === "reset") {
        path = "/api/admin/doctors/reset-password";
        values = {
          doctorId: String(selectedDoctor.id),
          password: form.password,
        };
      } else if (modal === "activate") {
        path = "/api/admin/doctors/set-active";
        values = {
          doctorId: String(selectedDoctor.id),
          active: "true",
        };
      } else if (modal === "deactivate") {
        path = "/api/admin/doctors/set-active";
        values = {
          doctorId: String(selectedDoctor.id),
          active: "false",
        };
      } else {
        throw new Error("Invalid action");
      }

      const result = await request(path, token, values);

      await loadDoctors(token);

      setMessage(result.message || "Saved successfully");
      setModal("");
      setSelectedDoctor(null);
      setForm(emptyForm);
    } catch (err) {
      if (err.message === "SESSION_EXPIRED") {
        clearSession();
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await request("/api/admin/logout", token, {});
    } catch {
      // Always clear the local session.
    } finally {
      clearSession();
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading Admin Dashboard...
      </main>
    );
  }

  if (!admin) return null;

  const registered = doctors.filter(
    (doctor) => doctor.hasAccount
  ).length;

  const active = doctors.filter(
    (doctor) => doctor.hasAccount && doctor.active
  ).length;

  const stats = [
    {
      label: "Total Doctors",
      value: doctors.length,
      icon: "🩺",
    },
    {
      label: "Login Accounts",
      value: registered,
      icon: "👤",
    },
    {
      label: "Active Accounts",
      value: active,
      icon: "✅",
    },
    {
      label: "Pending Accounts",
      value: doctors.length - registered,
      icon: "⏳",
    },
  ];

  const inputClass =
    "w-full rounded-xl border border-slate-700 " +
    "bg-slate-800 px-4 py-3 text-white outline-none " +
    "focus:border-cyan-400";

  const field = (label, key, type = "text") => (
    <div>
      <label className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <input
        type={type}
        required
        min={type === "number" ? "0" : undefined}
        max={type === "number" ? "1000000" : undefined}
        value={form[key]}
        onChange={(e) => updateForm(key, e.target.value)}
        className={inputClass}
      />
    </div>
  );

  const passwordField = (
    <div>
      <label className="mb-2 block text-sm font-medium">
        Doctor Password
      </label>

      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          value={form.password}
          onChange={(e) =>
            updateForm("password", e.target.value)
          }
          placeholder="Enter strong password"
          className={`${inputClass} pr-20`}
        />

        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-cyan-400"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Minimum 12 characters, uppercase, lowercase,
        number and special character.
      </p>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold">
              MediConnect
              <span className="text-cyan-400">+</span>
            </h1>
            <p className="text-xs text-slate-400">
              Administrator Dashboard
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-300 sm:block">
              {admin.email}
            </span>

            <button
              onClick={logout}
              className="rounded-xl border border-slate-600 px-5 py-2 text-sm hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-cyan-400">
              ADMIN OVERVIEW
            </p>

            <h2 className="text-3xl font-bold">
              Welcome to your dashboard
            </h2>

            <p className="mt-2 text-slate-400">
              Manage doctors, login accounts and access.
            </p>
          </div>

          <button
            onClick={() => openModal("add")}
            className="rounded-xl bg-cyan-500 px-6 py-3 font-bold text-slate-950 transition hover:bg-cyan-400"
          >
            + Add New Doctor
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-slate-900 p-5"
            >
              <div className="mb-4 text-3xl">
                {stat.icon}
              </div>

              <p className="text-3xl font-bold">
                {stat.value}
              </p>

              <p className="mt-2 text-sm text-slate-400">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {message && (
          <div
            role="status"
            className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-green-300"
          >
            {message}
          </div>
        )}

        {error && !modal && (
          <div
            role="alert"
            className="rounded-xl bg-red-500/10 p-4 text-red-400"
          >
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-6">
            <div>
              <h3 className="text-xl font-bold">
                Doctor Management
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                View and manage registered doctors.
              </p>
            </div>

            <button
              onClick={async () => {
                try {
                  setError("");
                  await loadDoctors(token);
                } catch (err) {
                  if (err.message === "SESSION_EXPIRED") {
                    clearSession();
                  } else {
                    setError(err.message);
                  }
                }
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-800/60 text-slate-400">
                <tr>
                  <th className="px-6 py-4">Doctor</th>
                  <th className="px-6 py-4">Specialty</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>

              <tbody>
                {doctors.map((doctor) => (
                  <tr
                    key={doctor.id}
                    className="border-t border-white/10"
                  >
                    <td className="px-6 py-5 font-medium">
                      {doctor.name}
                    </td>

                    <td className="px-6 py-5 text-slate-300">
                      {doctor.specialty}
                    </td>

                    <td className="px-6 py-5 text-slate-300">
                      {doctor.email || "Not registered"}
                    </td>

                    <td className="px-6 py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          !doctor.hasAccount
                            ? "bg-amber-500/15 text-amber-300"
                            : doctor.active
                            ? "bg-green-500/15 text-green-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {!doctor.hasAccount
                          ? "Pending"
                          : doctor.active
                          ? "Active"
                          : "Disabled"}
                      </span>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-2">
                        {!doctor.hasAccount ? (
                          <button
                            onClick={() =>
                              openModal("create", doctor)
                            }
                            className="rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                          >
                            Create Login
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                openModal("reset", doctor)
                              }
                              className="rounded-lg bg-slate-700 px-3 py-2 hover:bg-slate-600"
                            >
                              Reset Password
                            </button>

                            <button
                              onClick={() =>
                                openModal(
                                  doctor.active
                                    ? "deactivate"
                                    : "activate",
                                  doctor
                                )
                              }
                              className={`rounded-lg px-3 py-2 ${
                                doctor.active
                                  ? "bg-red-500/15 text-red-300"
                                  : "bg-green-500/15 text-green-300"
                              }`}
                            >
                              {doctor.active
                                ? "Disable"
                                : "Activate"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {doctors.length === 0 && (
              <p className="p-8 text-center text-slate-400">
                No doctors found.
              </p>
            )}
          </div>
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
          >
            <h3
              id="admin-modal-title"
              className="text-2xl font-bold"
            >
              {modal === "add"
                ? "Add New Doctor"
                : modal === "create"
                ? "Create Doctor Login"
                : modal === "reset"
                ? "Reset Doctor Password"
                : modal === "activate"
                ? "Activate Doctor"
                : "Disable Doctor"}
            </h3>

            <p className="mt-2 text-sm text-slate-400">
              {selectedDoctor
                ? selectedDoctor.name
                : "Enter the doctor's information below."}
            </p>

            <form
              onSubmit={submitForm}
              className="mt-6 space-y-4"
            >
              {modal === "add" && (
                <>
                  {field("Doctor Name", "name")}
                  {field("Specialization", "specialty")}
                  {field("Experience (e.g. 12 Years)", "experience")}
                  {field("Consultation Fee (₹)", "fee", "number")}
                  {field("Doctor Email", "email", "email")}
                  {passwordField}
                </>
              )}

              {modal === "create" && (
                <>
                  {field("Doctor Email", "email", "email")}
                  {passwordField}
                </>
              )}

              {modal === "reset" && passwordField}

              {modal === "deactivate" && (
                <p className="text-sm text-slate-300">
                  This doctor will no longer be able to
                  access their dashboard. Existing login
                  sessions will be revoked.
                </p>
              )}

              {modal === "activate" && (
                <p className="text-sm text-slate-300">
                  This doctor will be able to log in again.
                </p>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400"
                >
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeModal}
                  className="flex-1 rounded-xl border border-slate-600 py-3 hover:bg-slate-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-xl bg-cyan-500 py-3 font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
                >
                  {busy
                    ? "Saving..."
                    : modal === "add"
                    ? "Add Doctor"
                    : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
