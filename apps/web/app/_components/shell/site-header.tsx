import Image from "next/image";
import Link from "next/link";
import { OFFICER } from "../../_lib/officer";
import { BrandMark } from "./brand-mark";
import { MainNav } from "./main-nav";

export function SiteHeader() {
  return (
    <>
      <div className="bg-ink text-[13px] text-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <span>An official platform of the UAE Government · Ministry of Climate Change and Environment</span>
          <span lang="ar" dir="rtl" className="font-arabic">
            العربية
          </span>
        </div>
      </div>

      <header className="bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-3">
              <Image src="/uae-emblem.png" alt="Emblem of the United Arab Emirates" width={46} height={60} priority className="h-[60px] w-auto" />
              <div className="hidden flex-col leading-[1.3] sm:flex">
                <span lang="ar" dir="rtl" className="text-right font-arabic text-sm font-semibold sm:text-left">
                  الإمارات العربية المتحدة
                </span>
                <span className="text-[13px] font-medium tracking-[0.03em]">UNITED ARAB EMIRATES</span>
                <span className="text-xs text-ink-muted">Ministry of Climate Change and Environment</span>
              </div>
            </div>
            <div aria-hidden className="hidden h-12 w-px bg-line sm:block" />
            <Link href="/" className="flex items-center gap-3 rounded-control">
              <BrandMark size={44} />
              <span className="flex flex-col leading-[1.15]">
                <span className="text-[22px] font-bold tracking-tight">
                  Zerocarbon<span className="text-gold-600">.gov</span>
                </span>
                <span className="text-[13px] text-ink-muted">
                  <span lang="ar" className="font-arabic">
                    صفر كربون
                  </span>{" "}
                  · Emissions report review
                </span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2.5 rounded-control border border-line py-1.5 pl-1.5 pr-3">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-gold-100 text-[13px] font-bold text-gold-700">
              {OFFICER.initials}
            </span>
            <span className="flex flex-col text-xs leading-tight">
              <strong className="text-[13px] font-semibold">{OFFICER.name}</strong>
              <span className="text-ink-muted">
                {OFFICER.role}, {OFFICER.authorityShort}
              </span>
            </span>
          </div>
        </div>
      </header>
      <MainNav />
    </>
  );
}
