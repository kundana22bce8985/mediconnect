
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "http://localhost:8080";

export default function DoctorLogin() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = new URLSearchParams();
      body.append("email", email.trim());
      body.append("password", password);

      const response = await fetch(
        `${API_URL}/api/doctor/login`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(
          data.error ||
          data.message ||
          "Invalid doctor email or password"
        );
      }

      sessionStorage.setItem(
        "mediconnect_doctor_auth",
        JSON.stringify(data)
      );

      router.replace("/doctor/dashboard");
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Cannot connect to Java backend. Check port 8080."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-5 text-slate-900">
      <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-lg border">
        <h1 className="text-3xl font-bold text-teal-700 text-center">
          MediConnect+
        </h1>

        <h2 className="text-2xl font-bold text-center mt-5">
          Doctor Login
        </h2>

        <p className="text-slate-500 text-center mt-2 mb-7">
          Sign in to manage your appointments
        </p>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Doctor Email
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@example.com"
              className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Password
            </label>

            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-teal-700 text-sm mt-2"
            >
              {showPassword
                ? "Hide Password"
                : "Show Password"}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-700 hover:bg-teal-800 text-white py-3 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? "Signing In..." : "Sign In as Doctor"}
          </button>
        </form>

        <div className="text-center mt-6 text-sm">
          <span>Are you a patient? </span>
          <a
            href="/login"
            className="text-teal-700 font-semibold"
          >
            Patient Login
          </a>
        </div>
      </div>
    </main>
  );
}
