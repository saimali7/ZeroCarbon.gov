/** Zerocarbon.gov mark from the reference design: gold ring with a green leaf. */
export function BrandMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={className}>
      <circle cx="24" cy="24" r="19" fill="none" stroke="#B68A35" strokeWidth="6" />
      <path d="M24 13 C31 15 33 22 31 29 C25 30 18 28 17 22 C16 17 19 13.5 24 13 Z" fill="#2E7D46" />
      <path d="M19 33 C22 28 25 24 29 19" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
