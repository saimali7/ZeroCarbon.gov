#!/usr/bin/env python3
"""Generate the ZeroCarbon.gov demo submission packages.

Writes, for each fictional facility, the files an operator submits to EAD (Excel emissions
report, monitoring plan, verification statement, cover letter and supporting evidence), plus
simulated regulator-side reference data and demo/ANSWER-KEY.md.

Requirements: Python 3.10+, openpyxl, Google Chrome or Chromium (HTML to PDF). pypdf optional.
Usage: python3 demo/_generator/generate.py
"""
from __future__ import annotations

import csv
import json
import shutil
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from model import (  # noqa: E402
    EAST, FACILITIES, GWP_CH4, OPERATOR, PEERS, SOUTH, YEAR, Facility, compute, flagged_analysis, offset_latlon, plume_polygon,
)
from pdf_docs import build_pdfs, lab_sample_dates  # noqa: E402
from xlsx_report import build_report  # noqa: E402

DEMO = Path(__file__).resolve().parent.parent
SUBMISSIONS = DEMO / "submissions"
REGULATOR = DEMO / "regulator-reference-SIMULATED"


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)


def write_evidence(f: Facility, folder: Path) -> None:
    c = f.calc
    ev = folder / "evidence"
    quarter_ncv = [p["ncv"] for p in c["fuel_p"]]
    write_csv(ev / f"{f.code}_Fuel-Gas-Meter-FT3001_Monthly_{YEAR}.csv",
              ["month", "meter_tag", "volume_sm3", "data_status", "lab_ncv_mj_per_sm3", "note"],
              [[f"{YEAR}-{m + 1:02d}", "FT-3001", c["fuel_monthly"][m], "METERED", round(quarter_ncv[m // 3], 2),
                "Quarterly GC sample" if m in (1, 4, 7, 10) else ""] for m in range(12)])
    write_csv(ev / f"{f.code}_Flare-Log_Daily_{YEAR}.csv",
              ["date", "hp_flare_fl501_sm3", "hp_data_source", "lp_flare_fl502_sm3", "lp_data_source", "pilot_status", "event_notes"],
              [[r["date"].isoformat(), r["hp"], r["hp_src"], r["lp"], r["lp_src"], r["pilot"], r["note"]] for r in c["log"]])
    write_csv(ev / f"{f.code}_Diesel-Invoices_{YEAR}.csv",
              ["invoice_no", "delivery_date", "supplier", "product", "volume_litres", "density_kg_per_l_15c", "mass_t", "delivered_to"],
              [[i["invoice"], i["date"].isoformat(), "Oasis Fuel Supplies LLC", "Diesel (EN 590, 10 ppm S)", i["litres"], i["density"],
                i["tonnes"], i["tank"]] for i in c["invoices"]])
    write_csv(ev / f"{f.code}_Production-and-Gas-Balance_Monthly_{YEAR}.csv",
              ["month", "days", "oil_bbl", "avg_bopd", "gas_produced_sm3", "fuel_gas_sm3", "gas_exported_sm3", "gas_exported_boe",
               "gas_reinjected_sm3", "flared_by_balance_sm3", "note"],
              [[r["month"], r["days"], r["oil_bbl"], r["avg_bopd"], r["gas_produced_sm3"], r["fuel_gas_sm3"], r["gas_exported_sm3"],
                r["gas_exported_boe"], r["gas_reinjected_sm3"], r["flared_by_balance_sm3"],
                "Flared volume derived by difference (produced - fuel - exported - reinjected); production allocation report, not used for emissions reporting"
                if i == 0 else ""] for i, r in enumerate(c["production"])])


def write_regulator_data() -> None:
    rows = []
    for fid, op, name, lat, lon, mmboe, intensity, ch4_int, flare_int, n_sources in PEERS:
        total = round(intensity * mmboe * 1000)
        ch4 = round(ch4_int * mmboe, 1)
        rows.append([fid, op, name, "Abu Dhabi", lat, lon, YEAR, mmboe, total, total - round(ch4 * GWP_CH4), ch4, intensity, ch4_int,
                     flare_int, n_sources, "Unmodified"])
    for f in (EAST, SOUTH):
        c = f.calc
        n_sources = sum(1 for m in c["methane"] if m["ch4"])
        rows.append([f.ead_id, OPERATOR["name"], f.short, "Abu Dhabi", f.lat, f.lon, YEAR, c["mmboe"], c["total_co2e"], c["co2_total"],
                     c["ch4_total"], c["intensity"], c["ch4_intensity"], c["flare_intensity"], n_sources,
                     "Qualified" if f.flagged else "Unmodified"])
    rows.sort(key=lambda r: r[0])
    write_csv(REGULATOR / f"peer-benchmarks_onshore-oil-CPF_RY{YEAR}.csv",
              ["ead_facility_id", "operator", "facility", "emirate", "lat", "lon", "reporting_year", "production_mmboe", "reported_tco2e",
               "co2_t", "ch4_t", "intensity_kgco2e_per_boe", "ch4_intensity_t_per_mmboe", "flared_sm3_per_boe",
               "methane_sources_quantified", "verification_opinion"], rows)

    prior = []
    for f in (EAST, SOUTH):
        p = f.calc["prior"]
        prior += [
            [f.ead_id, f.short, YEAR - 1, "SS-01", "Fuel gas", p["fuel_sm3"], "Sm3", p["fuel_co2"], "", p["fuel_co2"]],
            [f.ead_id, f.short, YEAR - 1, "SS-02/03", "Flare gas (HP + LP), metered", p["flare_sm3"], "Sm3", p["flare_co2"], "", p["flare_co2"]],
            [f.ead_id, f.short, YEAR - 1, "SS-04", "Diesel", p["diesel_t"], "t", p["diesel_co2"], "", p["diesel_co2"]],
            [f.ead_id, f.short, YEAR - 1, "CH4", "All methane sources reported", "", "", "", p["ch4"], round(p["ch4"] * GWP_CH4)],
            [f.ead_id, f.short, YEAR - 1, "TOTAL", f"Total (production {p['mmboe']} MMboe, {p['intensity']} kg CO2e/boe)", "", "", "", "", p["total"]],
        ]
    write_csv(REGULATOR / f"prior-year-submissions_RY{YEAR - 1}.csv",
              ["ead_facility_id", "facility", "reporting_year", "item", "description", "activity", "unit", "co2_t", "ch4_t", "tco2e"], prior)

    features = []
    for f in (EAST, SOUTH):
        features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [f.lon, f.lat]},
                         "properties": {"kind": "facility", "ead_facility_id": f.ead_id, "facility": f.short, "operator": OPERATOR["name"]}})
        for equipment, (e, n) in f.equipment_offsets.items():
            la, lo = offset_latlon(f.lat, f.lon, e, n)
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lo, 6), round(la, 6)]},
                             "properties": {"kind": "equipment", "ead_facility_id": f.ead_id, "equipment": equipment}})
        for d in f.detections:
            e, n = f.equipment_offsets[d["equipment"]]
            la, lo = offset_latlon(f.lat, f.lon, e + 35, n - 20)
            props = {"detection_id": d["id"], "datetime_utc": d["utc"].isoformat().replace("+00:00", "Z"),
                     "local_time_gst": (d["utc"] + timedelta(hours=4)).strftime("%H:%M"),
                     "emission_rate_kg_ch4_per_h": d["rate"], "uncertainty_kg_per_h": d["unc"], "confidence": d["confidence"],
                     "wind_from_deg": d["wind_from"], "wind_speed_m_s": d["wind_speed"], "plume_length_m": d["length"],
                     "nearest_facility_id": f.ead_id, "nearest_facility": f.short, "nearest_equipment": d["equipment"], "distance_to_equipment_m": 40,
                     "instrument": "SIMULATED point-source methane imager (modelled on public hyperspectral plume products)",
                     "note": "Simulated for the ZeroCarbon.gov demo. A satellite detection is a signal to investigate, not proof of non-compliance."}
            features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lo, 6), round(la, 6)]},
                             "properties": {"kind": "plume_source", **props}})
            features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [plume_polygon(la, lo, d["wind_from"], d["length"])]},
                             "properties": {"kind": "plume_extent", "detection_id": d["id"]}})
    REGULATOR.mkdir(parents=True, exist_ok=True)
    (REGULATOR / f"satellite-methane-detections_{YEAR}_SIMULATED.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "name": "Simulated satellite methane detections", "features": features}, indent=2), encoding="utf-8")


def write_answer_key(a: dict) -> None:
    s, e = SOUTH.calc, EAST.calc
    sd = SOUTH.detections
    est_sm3 = sum(r["hp"] for r in s["log"] if r["hp_src"] == "ENGINEERING ESTIMATE")
    yoy = (s["total_co2e"] / s["prior"]["total"] - 1) * 100
    prod = (s["mmboe"] / s["prior"]["mmboe"] - 1) * 100
    flare_now = s["hp_co2"] + s["lp_co2"]
    flare_drop = s["prior"]["flare_co2"] - flare_now
    total_drop = s["prior"]["total"] - s["total_co2e"]
    peer_int = sorted([p[6] for p in PEERS] + [e["intensity"]])
    peer_median = peer_int[len(peer_int) // 2]
    peer_ch4 = sorted([p[7] for p in PEERS] + [e["ch4_intensity"]])
    folder = f"submissions/{SOUTH.folder}"
    text = f"""# Answer key: planted issues in the demo submissions

Generated by `_generator/generate.py`. The numbers below match the generated files. Use this page to rehearse and to check what the AI
review finds. **Keep it off screen during the live demo.**

## Eastern Dunes CPF-1 ({EAST.ead_id}): expected result **Compliant**

- Reported {e['total_co2e']:,} t CO2e ({e['co2_total']:,} t CO2 + {e['ch4_total']:,} t CH4), {e['mmboe']} MMboe, **{e['intensity']} kg CO2e/boe**, within the peer range.
- All nine methane sources quantified (sheet G), with LDAR survey evidence. Methane intensity {e['ch4_intensity']} t CH4/MMboe.
- One small data gap declared honestly (FT-5102, 11 to 13 March 2025, 30-day average substitution, EAD notified).
- Calibration certificates valid all year. Verification opinion: **unmodified**, CO2 and CH4 in scope.
- Year on year: {e['prior']['total']:,} to {e['total_co2e']:,} t CO2e ({(e['total_co2e'] / e['prior']['total'] - 1) * 100:+.1f}%) with production {(e['mmboe'] / e['prior']['mmboe'] - 1) * 100:+.1f}%. Consistent.
- Satellite: one simulated detection on 9 April 2025 ({EAST.detections[0]['rate']} kg/h at vent stack V-210) that **matches a declared,
  quantified planned blowdown** (flare log note, PTW-25-0418, sheet G line M-09). Shows the AI explaining a detection instead of flagging everything.

## Southern Dunes CPF-2 ({SOUTH.ead_id}): expected result **Non-compliant**, high risk

Reported {s['total_co2e']:,} t CO2e, {s['mmboe']} MMboe, **{s['intensity']} kg CO2e/boe** (lowest in the peer set; median {peer_median}).

| # | Issue | Where to find it | Rule it breaks | Estimated impact |
|---|---|---|---|---|
| 1 | **Methane method missing.** Only flare slip and combustion methane are reported. Tanks and the TEG vent are marked "not applicable, closed system", while pneumatics, seals and fugitives are "not quantified, de minimis". Yet C2 says the tanks have pressure/vacuum vents, the schematic shows "P/V vents to atmosphere", and the Monitoring Plan (section 6.3) says the method is "under development". | `G_Methane` M-04 to M-08; `C2` (a) and (b); Monitoring Plan section 3, Figure 1 and section 6.3 | Completeness: report all emissions (EAD TGD Step 3); a de minimis claim needs a quantified estimate (TGD App. 1.3 Step 3); Decree-Law 11/2024 Art. 6(1) | About {a['missing_ch4']:,.0f} t CH4, or {a['missing_co2e']:,} t CO2e. Estimate: East CPF-1's non-flare methane intensity ({a['east_other_int']} t/MMboe) x South's production |
| 2 | **Undeclared data gap.** HP flare meter FT-5101 calibration expired on 31 May 2025. From 1 June the flare log shows "ENGINEERING ESTIMATE" (flat values, about {a['hp_est_daily']:,} Sm3/d against about {a['hp_met_daily']:,} Sm3/d metered, {a['hp_drop_pct']}% lower). Yet H1 says "no data gaps", D1 claims Tier 2 metered, F says no fallback, and I lists FT-5101 as "In service". | `evidence/*Flare-Log_Daily*.csv` from 2025-06-01; `evidence/*Meter-Calibration-Certificates.pdf` (FT-5101 due 31 May 2025); `H1`, `D1`, `F`, `I` | Prevent and report data gaps and deviations from the Monitoring Plan (TGD Step 3 minimum contents); revise the plan within 30 days (TGD Step 2); own MP section 8.3 (30-day average, notify EAD); major source streams at least Tier 2 (EAD workshop 2026) | {est_sm3:,} Sm3 ({est_sm3 / s['hp_sm3']:.0%} of SS-02) rests on undocumented estimates |
| 3 | **Flare volumes contradict the company's own gas balance.** Jan to May the gas balance agrees with the meter ({a['met_closure_pct']:+.1f}%). Jun to Dec the reported flare is {abs(a['est_diff_pct']):.1f}% below the balance: {a['reported_est_sm3']:,} vs {a['balance_est_sm3']:,} Sm3. | `evidence/*Production-and-Gas-Balance*.csv` column `flared_by_balance_sm3` vs `D2` (b) monthly | Transparency and reproducibility (TGD Step 3); own MP section 8.2 control (>10% deviation must be investigated) | Gap {a['gap_sm3']:,} Sm3 = {a['gap_co2']:,} t CO2 + {a['gap_ch4']} t CH4, about **{a['gap_co2'] + round(a['gap_ch4'] * GWP_CH4):,} t CO2e** |
| 4 | **Wrong fuel gas emission factor.** D2 uses the IPCC default of {s['fuel_ef_used']} t CO2/TJ but labels it "site-specific Tier 3". The lab certificate mean is {s['fuel_ef_lab']} t CO2/TJ. Recalculation finding (verifier F-01). | `D2` row SS-01 vs `evidence/*Gas-Analysis-Certificate*.pdf` | Monitoring Plan section 5.2; consistency (TGD Step 3) | {a['ef_gap']:,} t CO2 ({a['ef_gap'] / s['total_co2e']:.1%}, below materiality) |
| 5 | **Peer and trend outlier.** {s['intensity']} kg CO2e/boe against a peer median of {peer_median} (range {peer_int[0]} to {peer_int[-1]}). Methane intensity {s['ch4_intensity']} t/MMboe against a peer range of {peer_ch4[0]} to {peer_ch4[-1]}. Year on year the total fell {abs(yoy):.1f}% while production rose {prod:.1f}%. The flare stream alone fell {flare_drop:,} t, more than the whole {total_drop:,} t decline. The only mitigation implemented (GTG-A upgrade, Nov 2025) saves about 2,100 t/yr. | `regulator-reference-SIMULATED/peer-benchmarks*.csv`, `prior-year-submissions*.csv`; `J` | Signal, not a rule breach: supports issues 1 to 3 | - |
| 6 | **Satellite methane signals (simulated).** {sd[0]['utc']:%d %b} {sd[0]['rate']:,} kg/h at the HP flare, the same day the flare log records a **pilot flame-out 12:05 to 18:35** (overpass 13:31 local), so unburnt gas was likely vented while the report assumes 98% combustion. {sd[1]['utc']:%d %b} {sd[1]['rate']:,} kg/h during the K-201B compressor trip. {sd[2]['utc']:%d %b} {sd[2]['rate']:,} kg/h at the tank farm, with no logged event, contradicting "closed system". | `regulator-reference-SIMULATED/satellite-methane-detections*.geojson`; flare log 2025-07-14 and 2025-08-02 | Signal to investigate (inspection), not proof | - |
| 7 | **Verification qualified, but the declarations say otherwise.** The statement is a qualified opinion (F-03 unresolved) and excludes M-04 to M-08 from scope. H1 says "Verified (see enclosed statement)" and the cover letter declares "complete and accurate ... no data gaps". | `*Verification-Statement*.pdf` sections 1, 4 and 5; `H1` (b); `*Cover-Letter*.pdf` | Accurate operator declaration; take account of verifier recommendations (TGD, operator principles) | - |

**Estimated total under-reporting:** about **{a['gap_total']:,} t CO2e ({a['gap_pct']}% of reported)**. Once corrected, Southern Dunes comes out at
about {a['corrected']:,} t CO2e, or **{a['corrected_intensity']} kg CO2e/boe**, in line with its peers. So under-reporting explains the outlier.

### Suggested AI output for Southern Dunes
- **Status:** Non-compliant. **Risk score:** about 85 to 90 out of 100.
- **Recommended action:** send a query requiring a corrected report within 30 days (TGD Step 5: errors corrected within 30 days of discovery),
  plus a revised Monitoring Plan covering all methane sources and FT-5101 reinstatement. Consider a site inspection (TGD Step 6) given the satellite signals.
- **Legal exposure if not remedied:** Decree-Law 11/2024 Art. 15, fines of AED 50,000 to 2,000,000 for breaching Art. 6(1), doubled for a repeat within 2 years (Art. 16).
- **Letter points (Arabic and English):** (1) declare the June to December FT-5101 data gap and recalculate using the MP section 8.3 substitution or the gas balance;
  (2) quantify M-04 to M-08; (3) apply the site-specific fuel gas EF; (4) explain the 14 July 2025 flame-out and 19 October 2025 tank-farm signal;
  (5) resubmit with an updated verification statement.

## Where each fact lives

- South flare log first estimate row: `{folder}/evidence/{SOUTH.code}_Flare-Log_Daily_{YEAR}.csv`, date 2025-06-01
- South FT-5101 certificate: `{folder}/evidence/{SOUTH.code}_Meter-Calibration-Certificates.pdf`, page 2 (next due 31 May 2025)
- South gas samples: {', '.join(d.isoformat() for d in lab_sample_dates(SOUTH))}
"""
    (DEMO / "ANSWER-KEY.md").write_text(text, encoding="utf-8")


def main() -> None:
    for f in (EAST, SOUTH):
        f.calc = compute(f)
    analysis = flagged_analysis(SOUTH, EAST)
    for path in (SUBMISSIONS, REGULATOR):
        if path.exists():
            shutil.rmtree(path)
    for f in FACILITIES:
        folder = SUBMISSIONS / f.folder
        build_report(f, folder / f"{f.code}_EAD-MRV-Emissions-Report_RY{YEAR}.xlsx")
        write_evidence(f, folder)
        build_pdfs(f, folder)
        print(f"  {f.short}: {f.calc['total_co2e']:,} t CO2e, {f.calc['intensity']} kg/boe -> {folder.relative_to(DEMO)}")
    write_regulator_data()
    write_answer_key(analysis)
    print(f"  Southern Dunes estimated under-reporting: {analysis['gap_total']:,} t CO2e ({analysis['gap_pct']}%)")
    print("Done.")


if __name__ == "__main__":
    main()
