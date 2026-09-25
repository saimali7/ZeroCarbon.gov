"use client";

import { useEffect, useState } from "react";
import { OFFICER } from "../../_lib/officer";

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Welcome, Mohammed" with the officer's role. The time-based salutation renders after mount to avoid a hydration mismatch. */
export function HomeGreeting() {
  const [salutation, setSalutation] = useState<string | null>(null);
  useEffect(() => {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Dubai" }).format(new Date()));
    setSalutation(greetingFor(hour));
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="h-5 text-sm font-medium text-gold-700">{salutation ?? ""}</p>
      <h1 className="text-[32px] font-bold leading-tight tracking-tight sm:text-[36px]">Welcome, {OFFICER.firstName}</h1>
      <p className="text-base text-ink-muted">
        {OFFICER.role} · {OFFICER.authority}
      </p>
    </div>
  );
}
