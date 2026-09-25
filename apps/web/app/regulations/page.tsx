import type { Metadata } from "next";
import { RegulationsCorpus } from "./_components/regulations-corpus";

export const metadata: Metadata = { title: "Regulations" };

export default function RegulationsPage() {
  return <RegulationsCorpus />;
}
