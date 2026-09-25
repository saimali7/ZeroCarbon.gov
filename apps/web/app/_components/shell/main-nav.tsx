"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Review queue", match: (p: string) => p === "/" || p.startsWith("/submissions") },
  { href: "/regulations", label: "Regulations", match: (p: string) => p.startsWith("/regulations") },
  { href: "/audit", label: "Audit log", match: (p: string) => p.startsWith("/audit") },
] as const;

export function MainNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="border-b border-line bg-surface">
      <ul className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-4 sm:px-6">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex h-11 items-center whitespace-nowrap px-3 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full after:transition-colors ${
                  active ? "text-ink after:bg-gold-500" : "text-ink-muted after:bg-transparent hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
