
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const doctors = [
  {
    id: 1,
    name: "Dr. Priya Sharma",
    specialty: "Cardiologist",
    experience: "12 Years",
    fee: 600,
    icon: "❤️",
  },
  {
    id: 2,
    name: "Dr. Rahul Verma",
    specialty: "Dermatologist",
    experience: "8 Years",
    fee: 500,
    icon: "🩺",
  },
  {
    id: 3,
    name: "Dr. Ananya Rao",
    specialty: "Neurologist",
    experience: "10 Years",
    fee: 800,
    icon: "🧠",
  },
  {
    id: 4,
    name: "Dr. Arjun Mehta",
    specialty: "Orthopedic",
    experience: "15 Years",
    fee: 700,
    icon: "🦴",
  },
];

export default function Home() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // CHECK LOGIN STATUS
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(
        "mediconnect_session"
      );

      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);

        if (parsedUser && parsedUser.email) {
          setUser(parsedUser);
        }
      }
    } catch (error) {
      console.error("Session error:", error);
      localStorage.removeItem("mediconnect_session");
    } finally {
      setAuthChecked(true);
    }
  }, []);

  // LOGOUT
  function handleLogout() {
    localStorage.removeItem("mediconnect_session");
    setUser(null);
    router.refresh();
  }

  // DOCTOR SEARCH
  const filteredDoctors = doctors.filter((doctor) =>
    `${doctor.name} ${doctor.specialty}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // BOOK APPOINTMENT
  function handleBooking(doctor) {
    if (!user) {
      alert("Please login to book an appointment.");
      router.push("/login");
      return;
    }

    alert(
      `Welcome ${user.name}! Appointment booking with ${doctor.name} will be available soon.`
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">

      {/* NAVBAR */}
      <nav className="flex flex-wrap items-center justify-between gap-4 bg-white px-6 py-5 shadow-sm md:px-12">

        <Link
          href="/"
          className="text-2xl font-bold text-teal-600"
        >
          MediConnect
          <span className="text-slate-900">+</span>
        </Link>

        <div className="flex flex-wrap items-center gap-5 text-sm font-medium">

          <Link href="/">Home</Link>

          <a href="#services">Services</a>

          <a href="#doctors">Find Doctors</a>

          {/* LOGIN / LOGOUT SECTION */}
          {authChecked && (
            user ? (
              <div className="flex flex-wrap items-center gap-3">

                <span className="font-semibold text-teal-700">
                  Welcome, {user.name}
                </span>

                <Link
                  href="/dashboard"
                  className="rounded-lg bg-teal-600 px-5 py-2 text-white hover:bg-teal-700"
                >
                  My Dashboard
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg bg-red-500 px-5 py-2 text-white hover:bg-red-600"
                >
                  Logout
                </button>

              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">

                <Link
                  href="/login"
                  className="rounded-lg bg-teal-600 px-5 py-2 text-white hover:bg-teal-700"
                >
                  Login
                </Link>

                <Link
                  href="/register"
                  className="rounded-lg border border-teal-600 px-5 py-2 text-teal-600 hover:bg-teal-50"
                >
                  Create Account
                </Link>

              </div>
            )
          )}

        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="bg-gradient-to-r from-teal-700 to-cyan-600 px-6 py-24 text-center text-white">

        <p className="mb-4 font-semibold tracking-widest">
          WELCOME TO MEDICONNECT
        </p>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          Your Health, Our Priority
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-teal-50">
          Find trusted doctors, book appointments, and access
          AI-powered healthcare services in one place.
        </p>

        <a
          href="#doctors"
          className="mt-9 inline-block rounded-xl bg-white px-8 py-4 font-bold text-teal-700 shadow-lg hover:bg-teal-50"
        >
          Find a Doctor
        </a>

      </section>

      {/* SERVICES */}
      <section
        id="services"
        className="mx-auto max-w-6xl px-6 py-20"
      >

        <h2 className="text-center text-3xl font-bold">
          Our Healthcare Services
        </h2>

        <p className="mt-3 text-center text-slate-500">
          Everything you need for better healthcare management.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">

          {[
            {
              icon: "🩺",
              title: "Find Doctors",
              description:
                "Search doctors by specialty and experience.",
            },
            {
              icon: "📅",
              title: "Book Appointments",
              description:
                "Schedule and manage doctor consultations.",
            },
            {
              icon: "🤖",
              title: "AI Medical Reports",
              description:
                "Get simplified explanations of medical reports.",
            },
          ].map((service) => (
            <div
              key={service.title}
              className="rounded-2xl bg-white p-8 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >

              <div className="text-5xl">
                {service.icon}
              </div>

              <h3 className="mt-5 text-xl font-bold">
                {service.title}
              </h3>

              <p className="mt-3 text-slate-500">
                {service.description}
              </p>

            </div>
          ))}

        </div>
      </section>

      {/* DOCTORS */}
      <section
        id="doctors"
        className="bg-teal-50 px-6 py-20"
      >

        <div className="mx-auto max-w-6xl">

          <h2 className="text-center text-3xl font-bold">
            Find Your Doctor
          </h2>

          <p className="mt-3 text-center text-slate-500">
            Search our demonstration doctor directory.
          </p>

          {/* SEARCH */}
          <input
            type="text"
            placeholder="Search by doctor name or specialty..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            className="mt-10 w-full rounded-xl border border-slate-200 bg-white p-4 outline-none focus:border-teal-500"
          />

          {/* DOCTOR CARDS */}
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">

            {filteredDoctors.map((doctor) => (
              <div
                key={doctor.id}
                className="rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-lg"
              >

                <div className="mb-5 text-5xl">
                  {doctor.icon}
                </div>

                <h3 className="text-lg font-bold">
                  {doctor.name}
                </h3>

                <p className="mt-2 font-medium text-teal-600">
                  {doctor.specialty}
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Experience: {doctor.experience}
                </p>

                <p className="mt-2 font-semibold">
                  ₹{doctor.fee} / Consultation
                </p>

                <button
                  type="button"
                  onClick={() => handleBooking(doctor)}
                  className="mt-6 w-full rounded-lg bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700"
                >
                  Book Appointment
                </button>

              </div>
            ))}

          </div>

          {filteredDoctors.length === 0 && (
            <p className="mt-8 text-center text-slate-500">
              No matching doctors found.
            </p>
          )}

        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 px-6 py-10 text-center text-white">

        <h2 className="text-2xl font-bold">
          MediConnect+
        </h2>

        <p className="mt-3 text-slate-300">
          Making healthcare accessible through technology.
        </p>

        <p className="mt-5 text-sm text-slate-400">
          Demo application. Doctor profiles are fictional.
        </p>

      </footer>

    </main>
  );
}
