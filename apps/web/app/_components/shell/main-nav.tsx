"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OFFICER } from "../../_lib/officer";

const ITEMS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" || p.startsWith("/submissions") },
  { href: "/queue", label: "Review queue", match: (p: string) => p.startsWith("/queue") },
  { href: "/regulations", label: "Regulations", match: (p: string) => p.startsWith("/regulations") },
  { href: "/audit", label: "Audit log", match: (p: string) => p.startsWith("/audit") },
] as const;

export function MainNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
        <ul className="-ml-3 flex gap-1 overflow-x-auto">
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
        <div className="hidden shrink-0 items-center gap-2.5 md:flex" title={`Signed in as ${OFFICER.name}`}>
          <span className="flex flex-col text-right text-xs leading-tight">
            <strong className="text-[13px] font-semibold">{OFFICER.name}</strong>
            <span className="text-ink-muted">
              {OFFICER.role}, {OFFICER.authorityShort}
            </span>
          </span>
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-gold-100 text-[12px] font-bold text-gold-700">
            {OFFICER.initials}
          </span>
        </div>
      </div>
    </nav>
  );
}
