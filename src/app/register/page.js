
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  formBody,
  saveAuth,
} from "../../lib/mediconnectAuth";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    const validPassword =
      password.length >= 8 &&
      /[a-zA-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^a-zA-Z0-9\s]/.test(password);

    if (!validPassword) {
      setError(
        "Use at least 8 characters with a letter, number and special character"
      );
      return;
    }

    setLoading(true);

    try {
      const result = await api("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody({ name, email, password }),
      });

      saveAuth(result);
      router.replace("/appointments");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-teal-700 to-cyan-600 flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 space-y-4"
      >
        <Link
          href="/"
          className="text-2xl font-bold text-teal-700"
        >
          MediConnect+
        </Link>

        <h1 className="text-2xl font-bold text-slate-900">
          Create Patient Account
        </h1>

        {error && (
          <p
            role="alert"
            className="bg-red-50 text-red-700 rounded-lg p-3"
          >
            {error}
          </p>
        )}

        <label className="block font-medium text-slate-800">
          Full name
          <input
            required
            maxLength={150}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full border rounded-lg p-3"
          />
        </label>

        <label className="block font-medium text-slate-800">
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full border rounded-lg p-3"
          />
        </label>

        <label className="block font-medium text-slate-800">
          Password
          <input
            required
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full border rounded-lg p-3"
          />
        </label>

        <p className="text-xs text-slate-600">
          At least 8 characters, including a letter,
          a number, and a special character.
        </p>

        <label className="block font-medium text-slate-800">
          Confirm password
          <input
            required
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-2 w-full border rounded-lg p-3"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
          />
          Show passwords
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold p-3"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>

        <p className="text-center text-slate-700">
          Already registered?{" "}
          <Link
            className="text-teal-700 font-bold"
            href="/login"
          >
            Login
          </Link>
        </p>
      </form>
    </main>
  );
}
