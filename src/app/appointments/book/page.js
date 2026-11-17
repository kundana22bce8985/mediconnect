
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  formBody,
  getAuth,
} from "../../../lib/mediconnectAuth";

const slots = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00",
  "16:00",
];

function today() {
  const d = new Date();

  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

function clock(value) {
  const [h, m] = value.split(":").map(Number);

  return (
    `${h % 12 || 12}:` +
    `${String(m).padStart(2, "0")} ` +
    `${h >= 12 ? "PM" : "AM"}`
  );
}

export default function BookAppointment() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function init() {
      if (!getAuth()?.token) {
        router.replace("/login");
        return;
      }

      try {
        const [me, ds, as] = await Promise.all([
          api("/api/me"),
          api("/api/doctors"),
          api("/api/appointments"),
        ]);

        if (!active) return;

        setUser(me);
        setDoctors(ds);
        setAppointments(as);

        if (ds.length) {
          setDoctorId(String(ds[0].id));
        }
      } catch (err) {
        if (active) {
          setError(err.message);

          if (!getAuth()?.token) {
            router.replace("/login");
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    init();

    return () => {
      active = false;
    };
  }, [router]);

  async function refresh() {
    setLoading(true);
    setError("");
    setTime("");

    try {
      setAppointments(
        await api("/api/appointments")
      );
    } catch (err) {
      setError(err.message);

      if (!getAuth()?.token) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }

  const doctor = doctors.find(
    (d) => Number(d.id) === Number(doctorId)
  );

  const booked = appointments
    .filter(
      (appointment) =>
        Number(appointment.doctorId) ===
          Number(doctorId) &&
        appointment.date === date &&
        appointment.status === "Booked"
    )
    .map((appointment) =>
      String(appointment.time).slice(0, 5)
    );

  function unavailable(slot) {
    return (
      !date ||
      loading ||
      booked.includes(slot) ||
      new Date(`${date}T${slot}:00`) <= new Date()
    );
  }

  async function book(e) {
    e.preventDefault();
    setError("");

    if (
      !doctor ||
      !date ||
      !time ||
      unavailable(time)
    ) {
      setError(
        "Choose an available future time slot"
      );
      return;
    }

    setSaving(true);

    try {
      const latest = await api("/api/appointments");

      setAppointments(latest);

      const alreadyBooked = latest.some(
        (appointment) =>
          Number(appointment.doctorId) ===
            Number(doctorId) &&
          appointment.date === date &&
          String(appointment.time).slice(0, 5) ===
            time &&
          appointment.status === "Booked"
      );

      if (alreadyBooked) {
        setTime("");

        throw new Error(
          "This slot was just booked. Choose another."
        );
      }

      await api("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: formBody({
          doctorId,
          date,
          time,
        }),
      });

      router.push("/appointments");
    } catch (err) {
      setError(err.message);

      try {
        setAppointments(
          await api("/api/appointments")
        );
      } catch {
        // Keep the original error visible.
      }
    } finally {
      setSaving(false);
    }
  }

  if (!user && !error) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <nav className="max-w-5xl mx-auto p-6 flex flex-wrap justify-between gap-4">
          <Link
            href="/"
            className="text-2xl font-bold text-teal-700"
          >
            MediConnect+
          </Link>

          <Link
            href="/appointments"
            className="text-teal-700 font-semibold"
          >
            My Appointments
          </Link>
        </nav>
      </header>

      <section className="bg-gradient-to-r from-teal-700 to-cyan-600 text-white p-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold">
            Book an Appointment
          </h1>

          <p className="mt-3">
            Select a doctor and an available consultation time.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto p-6 py-10">
        <form
          onSubmit={book}
          className="bg-white rounded-2xl shadow-sm border p-6 md:p-10 space-y-7"
        >
          <h2 className="text-2xl font-bold text-slate-900">
            Appointment Details
          </h2>

          {error && (
            <p
              role="alert"
              className="bg-red-50 text-red-700 p-4 rounded-lg"
            >
              {error}
            </p>
          )}

          <label className="block font-semibold text-slate-800">
            Select Doctor

            <select
              value={doctorId}
              required
              onChange={(e) => {
                setDoctorId(e.target.value);
                setTime("");
              }}
              className="block w-full mt-3 border rounded-xl p-4"
            >
              <option value="">
                Select a doctor
              </option>

              {doctors.map((d) => (
                <option
                  key={d.id}
                  value={d.id}
                >
                  {d.name} — {d.specialty}
                </option>
              ))}
            </select>
          </label>

          {doctor && (
            <div className="bg-teal-50 rounded-xl p-6">
              <h3 className="text-xl font-bold">
                {doctor.name}
              </h3>

              <p>
                {doctor.specialty} · {doctor.experience}
              </p>

              <p className="text-teal-700 font-bold mt-2">
                Consultation Fee: ₹{doctor.fee}
              </p>
            </div>
          )}

          <label className="block font-semibold text-slate-800">
            Appointment Date

            <input
              type="date"
              required
              min={today()}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTime("");
              }}
              className="block w-full mt-3 border rounded-xl p-4"
            />
          </label>

          <div>
            <div className="flex justify-between items-center gap-2">
              <h3 className="font-semibold text-slate-800">
                Available Time Slots
              </h3>

              <button
                type="button"
                onClick={refresh}
                disabled={loading || saving}
                className="text-teal-700 text-sm font-semibold"
              >
                Refresh Slots
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  disabled={
                    unavailable(slot) || saving
                  }
                  onClick={() => setTime(slot)}
                  className={`rounded-xl border p-4 font-semibold ${
                    time === slot
                      ? "bg-teal-600 text-white"
                      : unavailable(slot)
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-green-50 text-green-800 border-green-200 hover:bg-green-100"
                  }`}
                >
                  {clock(slot)}

                  <span className="block text-xs mt-1">
                    {unavailable(slot)
                      ? "Unavailable"
                      : time === slot
                      ? "Selected"
                      : "Available"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {doctor && date && time && (
            <div className="bg-slate-50 border rounded-xl p-5">
              <h3 className="font-bold mb-2">
                Booking Summary
              </h3>

              <p>{doctor.name}</p>
              <p>
                {date} at {clock(time)}
              </p>
              <p>₹{doctor.fee}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              saving ||
              !doctor ||
              !date ||
              !time ||
              unavailable(time)
            }
            className="w-full bg-teal-600 text-white font-bold rounded-xl p-4 hover:bg-teal-700 disabled:bg-gray-300"
          >
            {saving
              ? "Booking..."
              : "Confirm Appointment"}
          </button>
        </form>
      </section>
    </main>
  );
}
