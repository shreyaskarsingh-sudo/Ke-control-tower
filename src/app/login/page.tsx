"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoKwikLogo } from "@/components/ui/GoKwikLogo";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (el: HTMLElement, config: object) => void;
          disableAutoSelect: () => void;
        };
      };
    };
    handleGSICredential?: (response: { credential: string }) => void;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already logged in
    fetch("/api/auth/me").then((r) => {
      if (r.ok) router.replace("/dashboard");
    });
  }, [router]);

  useEffect(() => {
    // Define callback before GSI script fires
    window.handleGSICredential = async (response: { credential: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json();
        if (res.status === 403) {
          setError("Access restricted to @gokwik.co accounts only.");
          return;
        }
        if (!res.ok) {
          setError("Authentication failed. Please try again.");
          return;
        }
        if (data.ok) router.replace("/dashboard");
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    function initGSI() {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: window.handleGSICredential!,
        hosted_domain: "gokwik.co",
        auto_select: false,
      });
      const btnEl = document.getElementById("gsi-btn");
      if (btnEl) {
        window.google.accounts.id.renderButton(btnEl, {
          type: "standard",
          size: "large",
          theme: "outline",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 320,
        });
      }
    }

    const existing = document.getElementById("gsi-script");
    if (existing) {
      initGSI();
    } else {
      const script = document.createElement("script");
      script.id = "gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGSI;
      document.head.appendChild(script);
    }
  }, [router]);

  return (
    <div className="login-bg flex items-center justify-center min-h-screen p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #7999dc 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #fbbc00 0%, transparent 70%)" }}
        />
      </div>

      {/* Login card */}
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl px-10 py-10"
        style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.18)" }}
      >
        {/* Brand */}
        <div className="flex flex-col items-center mb-7">
          <GoKwikLogo size={52} showText={true} textColor="#001b44" className="mb-5" />
          <hr className="w-full border-surface-container-highest mb-5" />
          <h2 className="text-xl font-bold text-on-surface font-headline mb-1">
            KE Control Tower
          </h2>
          <p className="text-sm text-on-surface-variant text-center">
            KwikEngage merchant intelligence platform
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-error-container text-on-error-container text-sm text-center">
            ⚠️ {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center mb-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* GSI Button rendered here by renderButton() */}
        <div className="flex justify-center">
          <div id="gsi-btn" />
        </div>

        <p className="text-center text-xs text-on-surface-variant mt-6">
          Restricted to <span className="font-semibold text-primary">@gokwik.co</span> accounts
          <br />
          <span className="opacity-60">GoKwik Confidential · Internal Use Only</span>
        </p>
      </div>
    </div>
  );
}
