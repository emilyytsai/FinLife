"use client";

import { useEffect, useState } from "react";
import { ApiError, getHealth, getProfiles } from "@/lib/api";

// Phase 0 wiring check: calls the API and prints the raw results. Emi replaces this page with the app.

type CallResult = { status: "loading" } | { status: "ok"; data: unknown } | { status: "error"; message: string };

function useCall(call: () => Promise<unknown>): CallResult {
  const [result, setResult] = useState<CallResult>({ status: "loading" });
  useEffect(() => {
    let active = true;
    call()
      .then((data) => {
        if (active) setResult({ status: "ok", data });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? `${error.status}: ${error.message}` : String(error);
        if (active) setResult({ status: "error", message });
      });
    return () => {
      active = false;
    };
  }, [call]);
  return result;
}

export default function Home() {
  const health = useCall(getHealth);
  const profiles = useCall(getProfiles);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">FinLife API wiring check</h1>
        <p className="mt-1 text-sm text-muted">Calling {process.env.NEXT_PUBLIC_API_URL}</p>
      </header>
      <CallOutput title="GET /health" result={health} />
      <CallOutput title="GET /profiles" result={profiles} />
    </main>
  );
}

function CallOutput({ title, result }: { title: string; result: CallResult }) {
  return (
    <section className="rounded-card bg-surface p-5 shadow-soft">
      <h2 className="font-semibold">{title}</h2>
      {result.status === "loading" && <p className="mt-2 text-sm text-muted">Loading...</p>}
      {result.status === "error" && (
        <p role="alert" className="mt-2 text-sm text-alert">
          {result.message}
        </p>
      )}
      {result.status === "ok" && (
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-canvas p-3 text-xs">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      )}
    </section>
  );
}
