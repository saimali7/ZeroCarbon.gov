import type { Metadata } from "next";
import { HomeScreen } from "./_components/home/home-screen";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return <HomeScreen />;
}
