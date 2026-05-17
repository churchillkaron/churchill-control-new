"use client";

import { useEffect, useState } from "react";

export default function DashboardLayout({
  children,
}) {

  const [
    loading,
    setLoading,
  ] = useState(true);

  useEffect(() => {

    checkAuth();

  }, []);

  async function checkAuth() {

    try {

      const res =
        await fetch(
          "/api/auth/session"
        );

      const data =
        await res.json();

      if (
        !data?.authenticated
      ) {

        window.location.href =
          "/";
        return;
      }

    } catch (error) {

      window.location.href =
        "/";
      return;

    } finally {

      setLoading(false);
    }
  }

  if (loading) {

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        AUTHENTICATING...
      </div>
    );
  }

  return children;
}
