
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  formBody,
  saveAuth,
} from "../../lib/mediconnectAuth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await api("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody({
          email: email.trim(),
          password,
        }),
      });

      // Save patient authentication details
      saveAuth(result);

      // Redirect to Patient Dashboard after login
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-teal-700 to-cyan-600 flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 space-y-5"
      >
        {/* Website Logo */}
        <Link
          href="/"
          className="text-2xl font-bold text-teal-700"
        >
          MediConnect+
        </Link>

        {/* Login Heading */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mt-4">
            Patient Login
          </h1>

          <p className="text-slate-600 mt-2">
            Sign in to access your patient dashboard,
            book appointments, and manage your
            healthcare journey.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <p
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm"
          >
            {error}
          </p>
        )}

        {/* Email Input */}
        <label className="block text-slate-800 font-medium">
          Email Address

          <input
            type="email"
            autoComplete="email"
            placeholder="Enter your email address"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-teal-500"
          />
        </label>

        {/* Password Input */}
        <label className="block text-slate-800 font-medium">
          Password

          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-teal-500"
          />
        </label>

        {/* Show Password */}
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) =>
              setShowPassword(e.target.checked)
            }
            className="accent-teal-600"
          />
          Show Password
        </label>

        {/* Login Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold p-3 transition"
        >
          {loading
            ? "Signing in..."
            : "Login to Dashboard"}
        </button>

        {/* Registration Link */}
        <p className="text-center text-slate-700">
          Don't have an account?{" "}
          <Link
            href="/register"
            className="text-teal-700 font-bold hover:underline"
          >
            Create Account
          </Link>
        </p>

        {/* Back to Home */}
        <p className="text-center">
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-teal-700"
          >
            ← Back to Home
          </Link>
        </p>
      </form>
    </main>
  );
}
