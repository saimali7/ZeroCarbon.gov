"use client";

import type { ReactNode } from "react";
import { RulesProvider } from "./ui/rules";

export function Providers({ children }: { children: ReactNode }) {
  return <RulesProvider>{children}</RulesProvider>;
}
