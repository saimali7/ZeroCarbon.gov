"""Facility definitions and emissions calculations for the demo submission packages.

Every figure in the generated documents comes from here, so the files agree with
each other except where an issue is planted on purpose (Southern Dunes CPF-2).
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from statistics import mean

YEAR = 2025
DAYS = [date(YEAR, 1, 1) + timedelta(days=i) for i in range(365)]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

GWP_CH4 = 28  # IPCC AR5 GWP100, used for UNFCCC reporting under the Paris Agreement
MOLAR_VOLUME = 23.645  # m3/kmol, ideal gas at 15 degC and 101.325 kPa (standard conditions)
SM3_PER_BOE = 5800 * 0.0283168  # 5,800 scf of gas = 1 barrel of oil equivalent
FLARE_CE = 0.98
IPCC_NG_EF = 56.1  # t CO2/TJ, IPCC 2006 default for natural gas
DIESEL_NCV = 43.0  # GJ/t, IPCC 2006 default for gas/diesel oil
DIESEL_EF = 74.1  # t CO2/TJ, IPCC 2006 default for gas/diesel oil
CH4_EF_GAS_COMB = 1.0  # kg CH4/TJ, IPCC 2006 Vol. 2 Table 2.2, natural gas
CH4_EF_DIESEL_COMB = 3.0  # kg CH4/TJ, IPCC 2006 Vol. 2 Table 2.2, gas/diesel oil
M_CO2 = 44.010
M_CH4 = 16.043

OPERATOR = {
    "name": "Dunes Energy Company",
    "name_ar": "شركة الكثبان للطاقة",
    "abbr": "DEC",
    "licence": "CN-1049372",
    "address": "Dunes Energy Tower, Al Maryah Island, PO Box 47120, Abu Dhabi, UAE",
    "web": "www.dunesenergy.example",
    "hse_director": "Omar Al Kaabi",
}

VERIFIER = {
    "name": "Kestrel Verification Services LLC",
    "short": "Kestrel",
    "address": "Office 1204, Al Sila Tower, Abu Dhabi Global Market Square, Abu Dhabi, UAE",
    "accreditation": "ISO 14065:2020 accredited validation and verification body, Accreditation No. VB-0147",
    "ead_listing": "EAD list of accredited verifiers, entry KV-12",
    "reviewer": "Sophie Laurent",
    "expert": "Arjun Menon, CEng",
}

LAB = {
    "name": "Sabkha Analytical Laboratories LLC",
    "address": "Plot 7, ICAD II, Mussafah, Abu Dhabi, UAE",
    "accreditation": "ISO/IEC 17025:2017 accredited testing laboratory, Accreditation No. TL-0388",
    "analyst": "Fatima Zahra Idrissi",
    "approver": "Dr. Tariq Suleiman",
}

CALIB = {
    "name": "Gulfmetric Calibration Services LLC",
    "address": "Warehouse 22, Industrial City of Abu Dhabi (ICAD I), Abu Dhabi, UAE",
    "accreditation": "ISO/IEC 17025:2017 accredited calibration laboratory, Accreditation No. CL-0215",
    "technician": "Joseph Mathew",
    "approver": "Ahmed Fawzy",
}

LDAR_CONTRACTOR = {"name": "ClearSight OGI Surveys LLC", "lead": "Marco Rossi"}

# name, molar mass (kg/kmol), net calorific value (MJ/kg), carbon atoms
COMPONENTS = {
    "C1": ("Methane", 16.043, 50.03, 1),
    "C2": ("Ethane", 30.069, 47.51, 2),
    "C3": ("Propane", 44.096, 46.35, 3),
    "iC4": ("i-Butane", 58.122, 45.61, 4),
    "nC4": ("n-Butane", 58.122, 45.72, 4),
    "C5+": ("Pentanes plus (as n-C5)", 72.149, 45.35, 5),
    "CO2": ("Carbon dioxide", 44.010, 0.0, 1),
    "N2": ("Nitrogen", 28.014, 0.0, 0),
}
COMPOSITION_SIGMA = {"C2": 0.18, "C3": 0.09, "iC4": 0.03, "nC4": 0.04, "C5+": 0.03, "CO2": 0.06, "N2": 0.05}


def gas_props(comp: dict[str, float]) -> dict[str, float]:
    x = {k: v / 100 for k, v in comp.items()}
    molar_mass = sum(x[k] * COMPONENTS[k][1] for k in x)
    ncv_kmol = sum(x[k] * COMPONENTS[k][1] * COMPONENTS[k][2] for k in x)
    c_hc = sum(x[k] * COMPONENTS[k][3] for k in x if k != "CO2")
    c_inert = x["CO2"]
    return {
        "molar_mass": molar_mass,
        "rel_density": molar_mass / 28.9625,
        "ncv": ncv_kmol / MOLAR_VOLUME,
        "ef": (c_hc + c_inert) * M_CO2 / ncv_kmol * 1000,
        "carbon_wt": (c_hc + c_inert) * 12.011 / molar_mass * 100,
        "flare_co2": (c_hc * FLARE_CE + c_inert) * M_CO2 / MOLAR_VOLUME,
        "flare_ch4": x["C1"] * (1 - FLARE_CE) * M_CH4 / MOLAR_VOLUME,
        "vent_ch4": x["C1"] * M_CH4 / MOLAR_VOLUME,
    }


def quarterly_compositions(base: dict[str, float], rng: random.Random) -> list[dict[str, float]]:
    out = []
    for _ in range(4):
        comp = {k: round(max(0.02, v + rng.gauss(0, COMPOSITION_SIGMA[k])), 2) for k, v in base.items() if k != "C1"}
        comp = {"C1": round(100 - sum(comp.values()), 2), **comp}
        out.append(comp)
    return out


@dataclass
class Facility:
    key: str
    flagged: bool
    code: str
    folder: str
    name: str
    short: str
    field_name: str
    ead_id: str
    permit: str
    lat: float
    lon: float
    start_year: int
    oil_bopd: float
    gor: float
    export_share: float
    fuel_gas_sm3: int
    diesel_open_t: float
    diesel_close_t: float
    diesel_target_t: float
    diesel_deliveries: int
    flare_hp_mean: float
    flare_lp_mean: float
    fuel_comp: dict
    flare_comp: dict
    mp_rev: str
    mp_date: date
    submitted: date
    verifier_ref: str
    verif_notified: date
    site_visit: date
    verif_date: date
    lab_ref: str
    facility_manager: str
    ghg_lead: str
    ghg_lead_email: str
    ghg_lead_phone: str
    lead_verifier: str
    seed: int
    prior: dict
    equipment_offsets: dict
    detections: list
    events: dict = field(default_factory=dict)
    extra: dict = field(default_factory=dict)
    calc: dict = field(default_factory=dict)


EAST = Facility(
    key="east",
    flagged=False,
    code="DEC-EDF-CPF1",
    folder="DEC_Eastern-Dunes-CPF1_RY2025",
    name="Eastern Dunes Field Central Processing Facility 1 (CPF-1)",
    short="Eastern Dunes CPF-1",
    field_name="Eastern Dunes Field",
    ead_id="AD-OG-0412",
    permit="EP-2019-00944",
    lat=23.0520,
    lon=54.6180,
    start_year=2009,
    oil_bopd=47_100,
    gor=27.0,
    export_share=0.71,
    fuel_gas_sm3=76_208_954,
    diesel_open_t=29.4,
    diesel_close_t=27.9,
    diesel_target_t=1_047.3,
    diesel_deliveries=11,
    flare_hp_mean=68_000,
    flare_lp_mean=7_000,
    fuel_comp={"C1": 89.60, "C2": 5.80, "C3": 1.40, "iC4": 0.25, "nC4": 0.35, "C5+": 0.15, "CO2": 1.35, "N2": 1.10},
    flare_comp={"C1": 77.80, "C2": 10.20, "C3": 5.50, "iC4": 1.00, "nC4": 1.70, "C5+": 0.90, "CO2": 2.40, "N2": 0.50},
    mp_rev="4.0",
    mp_date=date(2025, 3, 20),
    submitted=date(2026, 3, 18),
    verifier_ref="KVS-25-094",
    verif_notified=date(2025, 6, 18),
    site_visit=date(2025, 9, 23),
    verif_date=date(2026, 3, 10),
    lab_ref="SAL-25-GC-0412",
    facility_manager="Eng. Rashed Al Neyadi",
    ghg_lead="Dr. Priya Nair",
    ghg_lead_email="priya.nair@dunesenergy.example",
    ghg_lead_phone="+971 2 555 0412",
    lead_verifier="Leila Haddad",
    seed=412,
    prior={"fuel_sm3": 77_000_000, "diesel_t": 1_080.0, "flare_sm3": 28_100_000, "other_ch4_t": 318.6, "mmboe": 19.42},
    equipment_offsets={"HP flare FL-501": (-380, 340), "Tank farm T-401A/B": (90, -160), "Vent stack V-210": (160, 95)},
    detections=[
        {"id": "SIM-2025-0409-E1", "utc": datetime(2025, 4, 9, 9, 34, 18, tzinfo=timezone.utc), "rate": 610, "unc": 280,
         "equipment": "Vent stack V-210", "wind_from": 320, "wind_speed": 4.1, "length": 1100, "confidence": "Medium"},
    ],
    events={
        date(2025, 2, 17): {"hp_add": 38_000, "note": "Planned flaring during K-201B start-up after maintenance (PTW-25-0211)."},
        date(2025, 3, 11): {"note": "FT-5102 LP flare meter offline (transducer fault). Volume substituted with 30-day average per MP section 8.3."},
        date(2025, 3, 12): {"note": "FT-5102 offline. Volume substituted with 30-day average."},
        date(2025, 3, 13): {"note": "FT-5102 offline. Volume substituted with 30-day average. Transducer replaced; recalibrated 14-Mar-2025."},
        date(2025, 4, 9): {"note": "Planned depressurisation of K-201A to atmosphere via vent stack V-210 (PTW-25-0418), 11:50-15:40. Vented 4,700 Sm3. Reported in sheet G (blowdowns)."},
        date(2025, 6, 22): {"note": "Planned depressurisation of pig launcher L-120 via V-210 (PTW-25-0733). Vented 1,900 Sm3. Reported in sheet G."},
        date(2025, 9, 8): {"hp_add": 52_000, "note": "Process upset: HP separator V-101 high pressure, relief to HP flare 14:05-16:30."},
        date(2025, 11, 5): {"note": "Planned depressurisation of TEG contactor inlet section via V-210 (PTW-25-1102). Vented 1,300 Sm3. Reported in sheet G."},
    },
    extra={
        "lp_gap_days": [date(2025, 3, 11), date(2025, 3, 12), date(2025, 3, 13)],
        "blowdowns": [
            (date(2025, 4, 9), 4_700, "K-201A compressor depressurisation", "PTW-25-0418"),
            (date(2025, 6, 22), 1_900, "Pig launcher L-120 depressurisation", "PTW-25-0733"),
            (date(2025, 11, 5), 1_300, "TEG contactor inlet section depressurisation", "PTW-25-1102"),
        ],
        "tank_uncontrolled_ch4_t": 3_012.0,
        "vru_availability": 0.968,
        "teg_ch4_t": 58.2,
        "pneumatics": [("Intermittent-bleed level controllers", 12, 1.75), ("Low-bleed valve positioners", 30, 0.335)],
        "seal_kg_per_day": 62.0,
        "fugitive_ch4_t": 74.0,
        "ldar": [
            ("Q1", date(2025, 2, 24), 9_412, 31, 31, 16.2),
            ("Q2", date(2025, 5, 19), 9_455, 27, 26, 21.4),
            ("Q3", date(2025, 8, 18), 9_470, 24, 24, 19.8),
            ("Q4", date(2025, 11, 17), 9_470, 19, 19, 16.6),
        ],
    },
)

SOUTH = Facility(
    key="south",
    flagged=True,
    code="DEC-SDF-CPF2",
    folder="DEC_Southern-Dunes-CPF2_RY2025",
    name="Southern Dunes Field Central Processing Facility 2 (CPF-2)",
    short="Southern Dunes CPF-2",
    field_name="Southern Dunes Field",
    ead_id="AD-OG-0417",
    permit="EP-2020-01873",
    lat=22.8140,
    lon=54.1375,
    start_year=2012,
    oil_bopd=64_100,
    gor=25.5,
    export_share=0.70,
    fuel_gas_sm3=98_642_317,
    diesel_open_t=38.2,
    diesel_close_t=41.5,
    diesel_target_t=1_418.6,
    diesel_deliveries=15,
    flare_hp_mean=98_000,
    flare_lp_mean=9_000,
    fuel_comp={"C1": 88.90, "C2": 6.20, "C3": 1.60, "iC4": 0.30, "nC4": 0.40, "C5+": 0.20, "CO2": 1.40, "N2": 1.00},
    flare_comp={"C1": 76.50, "C2": 10.80, "C3": 5.90, "iC4": 1.10, "nC4": 1.90, "C5+": 1.00, "CO2": 2.30, "N2": 0.50},
    mp_rev="3.0",
    mp_date=date(2025, 3, 27),
    submitted=date(2026, 3, 30),
    verifier_ref="KVS-25-117",
    verif_notified=date(2025, 6, 26),
    site_visit=date(2025, 11, 12),
    verif_date=date(2026, 3, 24),
    lab_ref="SAL-25-GC-0417",
    facility_manager="Eng. Saeed Al Marzouqi",
    ghg_lead="Hind Al Shamsi",
    ghg_lead_email="hind.alshamsi@dunesenergy.example",
    ghg_lead_phone="+971 2 555 0417",
    lead_verifier="Daniel Okafor",
    seed=417,
    prior={"fuel_sm3": 96_100_000, "diesel_t": 1_380.0, "flare_sm3": 36_800_000, "other_ch4_t": 0.0, "mmboe": 25.19},
    equipment_offsets={"HP flare FL-501": (-420, 380), "Tank farm T-401A/B": (-40, -150), "Vent stack V-210": (140, 80)},
    detections=[
        {"id": "SIM-2025-0714-S1", "utc": datetime(2025, 7, 14, 9, 31, 12, tzinfo=timezone.utc), "rate": 1_820, "unc": 610,
         "equipment": "HP flare FL-501", "wind_from": 315, "wind_speed": 5.2, "length": 1_650, "confidence": "High"},
        {"id": "SIM-2025-0802-S2", "utc": datetime(2025, 8, 2, 9, 36, 40, tzinfo=timezone.utc), "rate": 940, "unc": 380,
         "equipment": "HP flare FL-501", "wind_from": 300, "wind_speed": 3.8, "length": 1_250, "confidence": "Medium"},
        {"id": "SIM-2025-1019-S3", "utc": datetime(2025, 10, 19, 9, 28, 5, tzinfo=timezone.utc), "rate": 710, "unc": 300,
         "equipment": "Tank farm T-401A/B", "wind_from": 330, "wind_speed": 4.4, "length": 1_050, "confidence": "Medium"},
    ],
    events={
        date(2025, 3, 4): {"hp_add": 41_000, "note": "Planned flaring during K-201A restart after trip (PTW-25-0240)."},
        date(2025, 6, 1): {"note": "FT-5101 removed for recalibration (vendor backlog). HP flare volume estimated from engineering model until meter reinstated."},
        date(2025, 7, 14): {"pilot": "FLAME-OUT ALARM 12:05-18:35", "note": "HP flare pilot flame-out alarm. Pilot re-ignited 18:35. Volume per engineering estimate."},
        date(2025, 8, 2): {"hp_add": 175_000, "note": "K-201B compressor trip 10:40-16:15; gas routed to HP flare. Volume per engineering estimate."},
    },
    extra={
        "estimate_start": date(2025, 6, 1),
        "hp_estimates": {6: 31_500, 7: 32_000, 8: 31_000, 9: 32_500, 10: 31_500, 11: 30_500, 12: 31_000},
        "estimate_overrides": {date(2025, 8, 2): 58_000},
    },
)

FACILITIES = [EAST, SOUTH]


def split_by_month(total: float, rng: random.Random, noise: float = 0.035) -> list[int]:
    weights = [d * max(0.5, rng.gauss(1, noise)) for d in MONTH_DAYS]
    s = sum(weights)
    vals = [round(total * w / s) for w in weights]
    vals[-1] = round(total - sum(vals[:-1]))
    return vals


def monthly_sum(rows: list[dict], key: str) -> list[int]:
    sums = [0] * 12
    for r in rows:
        sums[r["date"].month - 1] += r[key]
    return sums


def build_flare_log(f: Facility, rng: random.Random) -> list[dict]:
    log = []
    for d in DAYS:
        ev = f.events.get(d, {})
        hp = round(f.flare_hp_mean * max(0.5, rng.gauss(1, 0.15))) + ev.get("hp_add", 0)
        lp = round(f.flare_lp_mean * max(0.5, rng.gauss(1, 0.18)))
        log.append({
            "date": d, "hp_true": hp, "lp_true": lp, "hp": hp, "lp": lp,
            "hp_src": "FT-5101 metered", "lp_src": "FT-5102 metered",
            "pilot": ev.get("pilot", "Lit"), "note": ev.get("note", ""),
        })
    x = f.extra
    if f.flagged:
        for rec in log:
            if rec["date"] >= x["estimate_start"]:
                rec["hp"] = x["estimate_overrides"].get(rec["date"], x["hp_estimates"][rec["date"].month])
                rec["hp_src"] = "ENGINEERING ESTIMATE"
    for gap_day in x.get("lp_gap_days", []):
        i = gap_day.timetuple().tm_yday - 1
        log[i]["lp"] = round(mean(r["lp"] for r in log[max(0, i - 30):i]))
        log[i]["lp_src"] = "SUBSTITUTED (30-day average)"
    return log


def build_diesel_invoices(f: Facility, rng: random.Random) -> list[dict]:
    deliveries_t = f.diesel_target_t + f.diesel_close_t - f.diesel_open_t
    dates = sorted(rng.sample(DAYS[4:360], f.diesel_deliveries))
    weights = [max(0.5, rng.gauss(1, 0.18)) for _ in dates]
    rows = []
    for i, (d, w) in enumerate(zip(dates, weights)):
        density = round(rng.uniform(0.838, 0.848), 4)
        litres = round(deliveries_t * w / sum(weights) * 1000 / density / 10) * 10
        rows.append({
            "invoice": f"OFS-{d:%y%m}-{rng.randint(1000, 9999)}",
            "date": d,
            "litres": litres,
            "density": density,
            "tonnes": round(litres * density / 1000, 3),
            "tank": "TK-801 (EDG-1 day tank / fire pump tank)" if i % 3 else "TK-802 (main diesel storage)",
        })
    return rows


def build_production(f: Facility, rng: random.Random, flare_true: list[int], fuel: list[int]) -> list[dict]:
    rows = []
    for m in range(12):
        oil = round(f.oil_bopd * MONTH_DAYS[m] * max(0.9, rng.gauss(1, 0.02)))
        produced = round(oil * f.gor * max(0.95, rng.gauss(1, 0.01)))
        flared = round(flare_true[m] * rng.gauss(1, 0.012))
        exported = round(produced * f.export_share * rng.gauss(1, 0.01))
        reinjected = produced - fuel[m] - exported - flared
        assert reinjected > 0, f"negative reinjection for {f.key} month {m + 1}"
        rows.append({
            "month": f"{YEAR}-{m + 1:02d}", "days": MONTH_DAYS[m], "oil_bbl": oil, "avg_bopd": round(oil / MONTH_DAYS[m]),
            "gas_produced_sm3": produced, "fuel_gas_sm3": fuel[m], "gas_exported_sm3": exported,
            "gas_exported_boe": round(exported / SM3_PER_BOE), "gas_reinjected_sm3": reinjected, "flared_by_balance_sm3": flared,
        })
    return rows


def methane_lines(f: Facility, c: dict) -> list[dict]:
    flare_basis = f"{c['flare_sm3']:,.0f} Sm3 flared x {c['flare_ch4_f']:.4f} t CH4/10^3 Sm3"
    lines = [
        {"id": "M-01", "source": "Flare combustion slip (FL-501, FL-502)", "category": "Incomplete combustion",
         "method": f"Flare volume x CH4 content x (1 - {FLARE_CE:.2f} combustion efficiency)", "basis": flare_basis,
         "ch4": round(c["flare_sm3"] / 1000 * c["flare_ch4_f"], 1), "note": "Composition from quarterly GC analysis of flare header gas."},
        {"id": "M-02", "source": "Fuel gas combustion (GTG-A/B/C, K-201A/B drivers, H-101A/B)", "category": "Combustion",
         "method": "IPCC 2006 Tier 1 factor, 1 kg CH4/TJ", "basis": f"{c['fuel_tj']:,.1f} TJ",
         "ch4": round(c["fuel_tj"] * CH4_EF_GAS_COMB / 1000, 1), "note": ""},
        {"id": "M-03", "source": "Diesel combustion (EDG-1, P-801A/B)", "category": "Combustion",
         "method": "IPCC 2006 Tier 1 factor, 3 kg CH4/TJ", "basis": f"{c['diesel_tj']:,.2f} TJ",
         "ch4": round(c["diesel_tj"] * CH4_EF_DIESEL_COMB / 1000, 1), "note": ""},
    ]
    if f.flagged:
        lines += [
            {"id": "M-04", "source": "Crude storage tanks T-401A/B (flashing, working and breathing)", "category": "Venting",
             "method": "Not applicable", "basis": "Closed system (no venting)", "ch4": None, "note": "Not applicable: closed system."},
            {"id": "M-05", "source": "TEG dehydration unit U-250 still vent", "category": "Venting",
             "method": "Not applicable", "basis": "", "ch4": None, "note": "Not applicable."},
            {"id": "M-06", "source": "Gas-driven pneumatic controllers", "category": "Venting",
             "method": "Not quantified", "basis": "", "ch4": None, "note": "Considered de minimis."},
            {"id": "M-07", "source": "Compressor seals K-201A/B", "category": "Venting",
             "method": "Not quantified", "basis": "", "ch4": None, "note": "Considered de minimis."},
            {"id": "M-08", "source": "Fugitive components (valves, flanges, connectors)", "category": "Fugitive",
             "method": "Not quantified", "basis": "", "ch4": None, "note": "Considered de minimis. LDAR programme planned for 2026."},
            {"id": "M-09", "source": "Maintenance blowdowns / depressurisation", "category": "Venting",
             "method": "Event log", "basis": "No vented events recorded", "ch4": 0.0, "note": "None recorded."},
        ]
        return lines
    x = f.extra
    tanks = round(x["tank_uncontrolled_ch4_t"] * (1 - x["vru_availability"]), 1)
    pneu = round(sum(n * ef for _, n, ef in x["pneumatics"]), 1)
    seals = round(2 * x["seal_kg_per_day"] * 365 / 1000, 1)
    blow_sm3 = sum(v for _, v, _, _ in x["blowdowns"])
    lines += [
        {"id": "M-04", "source": "Crude storage tanks T-401A/B (flashing, working and breathing)", "category": "Venting",
         "method": "Process simulation (Peng-Robinson) of separator-to-tank flash + VRU availability",
         "basis": f"Uncontrolled {x['tank_uncontrolled_ch4_t']:,.0f} t CH4 x (1 - {x['vru_availability']:.1%} VRU-401 availability)",
         "ch4": tanks, "note": "VRU-401 downtime from maintenance log (280 h)."},
        {"id": "M-05", "source": "TEG dehydration unit U-250 still vent", "category": "Venting",
         "method": "GRI-GLYCalc v4 with measured lean/rich TEG circulation", "basis": "Annual average operating conditions",
         "ch4": x["teg_ch4_t"], "note": "Still vent condenser in service all year."},
        {"id": "M-06", "source": "Gas-driven pneumatic controllers", "category": "Venting",
         "method": "Device inventory x device-specific bleed factor (2024 bleed-rate survey)",
         "basis": "; ".join(f"{n} {name.lower()} x {ef} t/yr" for name, n, ef in x["pneumatics"]),
         "ch4": pneu, "note": "All other controllers on instrument air since 2024."},
        {"id": "M-07", "source": "Compressor wet seals K-201A/B (degassing vents)", "category": "Venting",
         "method": "Quarterly measurement of seal-oil degassing vent flow and CH4 content",
         "basis": f"2 compressors x {x['seal_kg_per_day']:.0f} kg CH4/day x 365 days", "ch4": seals, "note": ""},
        {"id": "M-08", "source": "Fugitive components (valves, flanges, connectors)", "category": "Fugitive",
         "method": "Quarterly OGI LDAR survey, Hi-Flow quantification of detected leaks",
         "basis": "See LDAR survey summary 2025", "ch4": x["fugitive_ch4_t"], "note": "101 leaks detected, 100 repaired."},
        {"id": "M-09", "source": "Maintenance blowdowns / depressurisation (vent stack V-210)", "category": "Venting",
         "method": "Vented volume from pressure/volume calculation x CH4 content",
         "basis": f"3 events, {blow_sm3:,.0f} Sm3 x {c['vent_ch4_f']:.4f} t CH4/10^3 Sm3",
         "ch4": round(blow_sm3 / 1000 * c["vent_ch4_f"], 1), "note": "Events logged under PTW-25-0418, -0733, -1102."},
    ]
    return lines


def compute(f: Facility) -> dict:
    rng = random.Random(f.seed)
    fuel_q = quarterly_compositions(f.fuel_comp, rng)
    flare_q = quarterly_compositions(f.flare_comp, rng)
    fuel_p = [gas_props(q) for q in fuel_q]
    flare_p = [gas_props(q) for q in flare_q]
    log = build_flare_log(f, rng)
    fuel_monthly = split_by_month(f.fuel_gas_sm3, rng)
    invoices = build_diesel_invoices(f, rng)
    hp_m, lp_m = monthly_sum(log, "hp"), monthly_sum(log, "lp")
    flare_true_m = [a + b for a, b in zip(monthly_sum(log, "hp_true"), monthly_sum(log, "lp_true"))]
    production = build_production(f, rng, flare_true_m, fuel_monthly)

    c: dict = {"fuel_q": fuel_q, "flare_q": flare_q, "fuel_p": fuel_p, "flare_p": flare_p, "log": log,
               "fuel_monthly": fuel_monthly, "invoices": invoices, "hp_m": hp_m, "lp_m": lp_m, "production": production}
    c["fuel_ncv"] = round(mean(p["ncv"] for p in fuel_p), 2)
    c["fuel_ef_lab"] = round(mean(p["ef"] for p in fuel_p), 2)
    c["fuel_ef_used"] = IPCC_NG_EF if f.flagged else c["fuel_ef_lab"]
    c["flare_co2_f"] = round(mean(p["flare_co2"] for p in flare_p), 3)
    c["flare_ch4_f"] = round(mean(p["flare_ch4"] for p in flare_p), 4)
    c["vent_ch4_f"] = round(mean(p["vent_ch4"] for p in flare_p), 4)

    c["fuel_tj"] = round(f.fuel_gas_sm3 * c["fuel_ncv"] / 1e6, 1)
    c["fuel_co2"] = round(c["fuel_tj"] * c["fuel_ef_used"])
    c["hp_sm3"], c["lp_sm3"] = sum(hp_m), sum(lp_m)
    c["flare_sm3"] = c["hp_sm3"] + c["lp_sm3"]
    c["hp_co2"] = round(c["hp_sm3"] / 1000 * c["flare_co2_f"])
    c["lp_co2"] = round(c["lp_sm3"] / 1000 * c["flare_co2_f"])
    c["diesel_deliveries_t"] = round(sum(i["tonnes"] for i in invoices), 1)
    c["diesel_t"] = round(c["diesel_deliveries_t"] + f.diesel_open_t - f.diesel_close_t, 1)
    c["diesel_tj"] = round(c["diesel_t"] * DIESEL_NCV / 1000, 2)
    c["diesel_co2"] = round(c["diesel_tj"] * DIESEL_EF)
    c["co2_total"] = c["fuel_co2"] + c["hp_co2"] + c["lp_co2"] + c["diesel_co2"]

    c["methane"] = methane_lines(f, c)
    c["ch4_total"] = round(sum(m["ch4"] for m in c["methane"] if m["ch4"] is not None), 1)
    c["ch4_co2e"] = round(c["ch4_total"] * GWP_CH4)
    c["total_co2e"] = c["co2_total"] + c["ch4_co2e"]

    c["oil_bbl"] = sum(r["oil_bbl"] for r in production)
    c["gas_exported_sm3"] = sum(r["gas_exported_sm3"] for r in production)
    c["gas_boe"] = c["gas_exported_sm3"] / SM3_PER_BOE
    c["mmboe"] = round((c["oil_bbl"] + c["gas_boe"]) / 1e6, 2)
    c["intensity"] = round(c["total_co2e"] / (c["mmboe"] * 1e3), 2)
    c["ch4_intensity"] = round(c["ch4_total"] / c["mmboe"], 1)
    c["flare_intensity"] = round(c["flare_sm3"] / (c["mmboe"] * 1e6), 2)

    streams = [
        ("SS-01", "Fuel gas", c["fuel_co2"]),
        ("SS-02", "HP flare gas", c["hp_co2"]),
        ("SS-03", "LP flare gas", c["lp_co2"]),
        ("SS-04", "Diesel", c["diesel_co2"]),
    ]
    c["streams"] = [(sid, name, co2, stream_category(co2, c["total_co2e"])) for sid, name, co2 in streams]

    p = f.prior
    fuel24 = round(p["fuel_sm3"] * c["fuel_ncv"] / 1e6 * c["fuel_ef_used"])
    flare24 = round(p["flare_sm3"] / 1000 * c["flare_co2_f"])
    diesel24 = round(p["diesel_t"] * DIESEL_NCV / 1000 * DIESEL_EF)
    ch4_24 = round(p["flare_sm3"] / 1000 * c["flare_ch4_f"] + p["fuel_sm3"] * c["fuel_ncv"] / 1e9 * CH4_EF_GAS_COMB + p["other_ch4_t"], 1)
    total24 = fuel24 + flare24 + diesel24 + round(ch4_24 * GWP_CH4)
    c["prior"] = {"fuel_co2": fuel24, "flare_co2": flare24, "diesel_co2": diesel24, "ch4": ch4_24, "total": total24,
                  "mmboe": p["mmboe"], "intensity": round(total24 / (p["mmboe"] * 1e3), 2), **p}
    return c


def stream_category(co2: float, total: float) -> str:
    if co2 < max(1_000, min(0.02 * total, 20_000)):
        return "De-minimis"
    if co2 < max(5_000, min(0.10 * total, 100_000)):
        return "Minor"
    return "Major"


def flagged_analysis(south: Facility, east: Facility) -> dict:
    c, e = south.calc, east.calc
    est = range(5, 12)
    metered = range(0, 5)
    bal_est = sum(c["production"][m]["flared_by_balance_sm3"] for m in est)
    rep_est = sum(c["hp_m"][m] + c["lp_m"][m] for m in est)
    bal_met = sum(c["production"][m]["flared_by_balance_sm3"] for m in metered)
    rep_met = sum(c["hp_m"][m] + c["lp_m"][m] for m in metered)
    gap = bal_est - rep_est
    gap_co2 = round(gap / 1000 * c["flare_co2_f"])
    gap_ch4 = round(gap / 1000 * c["flare_ch4_f"], 1)
    ef_gap = round(c["fuel_tj"] * c["fuel_ef_lab"]) - c["fuel_co2"]
    east_other = sum(m["ch4"] for m in e["methane"] if m["id"] in {"M-04", "M-05", "M-06", "M-07", "M-08", "M-09"})
    east_other_int = east_other / e["mmboe"]
    missing_ch4 = round(east_other_int * c["mmboe"], 0)
    missing_co2e = round(missing_ch4 * GWP_CH4)
    gap_total = gap_co2 + round(gap_ch4 * GWP_CH4) + ef_gap + missing_co2e
    corrected = c["total_co2e"] + gap_total
    hp_met_daily = mean(r["hp"] for r in c["log"] if r["date"] < south.extra["estimate_start"])
    hp_est_daily = mean(r["hp"] for r in c["log"] if r["date"] >= south.extra["estimate_start"])
    return {
        "balance_est_sm3": bal_est, "reported_est_sm3": rep_est, "balance_met_sm3": bal_met, "reported_met_sm3": rep_met,
        "met_closure_pct": round((bal_met / rep_met - 1) * 100, 1), "est_diff_pct": round((rep_est / bal_est - 1) * 100, 1),
        "gap_sm3": gap, "gap_co2": gap_co2, "gap_ch4": gap_ch4, "ef_gap": ef_gap,
        "east_other_ch4": round(east_other, 1), "east_other_int": round(east_other_int, 2),
        "missing_ch4": missing_ch4, "missing_co2e": missing_co2e, "gap_total": gap_total, "gap_pct": round(gap_total / c["total_co2e"] * 100, 1),
        "corrected": corrected, "corrected_intensity": round(corrected / (c["mmboe"] * 1e3), 2),
        "hp_met_daily": round(hp_met_daily), "hp_est_daily": round(hp_est_daily),
        "hp_drop_pct": round((1 - hp_est_daily / hp_met_daily) * 100, 1),
    }


PEERS = [
    ("AD-OG-0391", "Red Sand Oil Operations", "Red Sand North CPF", 23.412, 53.884, 31.80, 13.4, 34.1, 1.52, 9),
    ("AD-OG-0396", "Palm Ridge Petroleum", "Palm Ridge CPF-1", 23.206, 54.402, 22.60, 14.8, 44.0, 1.71, 8),
    ("AD-OG-0403", "Wadi Basin Energy", "Basin Central CPF", 22.957, 53.612, 18.90, 11.9, 26.3, 1.18, 9),
    ("AD-OG-0408", "Salt Flat Petroleum", "Sabkha West GOSP", 23.588, 53.521, 14.20, 16.2, 52.4, 1.93, 7),
    ("AD-OG-0421", "Horizon Desert Oil", "Horizon CPF-3", 22.731, 54.781, 27.50, 13.9, 38.2, 1.47, 9),
    ("AD-OG-0426", "Red Sand Oil Operations", "Red Sand South CPF", 23.301, 53.963, 20.40, 12.6, 29.0, 1.33, 8),
]


def offset_latlon(lat: float, lon: float, east_m: float, north_m: float) -> tuple[float, float]:
    return lat + north_m / 111_320, lon + east_m / (111_320 * math.cos(math.radians(lat)))


def plume_polygon(lat: float, lon: float, wind_from: float, length: float) -> list[list[float]]:
    to = math.radians((wind_from + 180) % 360)
    u = (math.sin(to), math.cos(to))
    v = (math.cos(to), -math.sin(to))
    steps = 14
    left, right = [], []
    for i in range(steps + 1):
        s = length * i / steps
        half = 0.19 * length * math.sin(math.pi * min(1.0, (i / steps) * 1.15)) ** 0.8 if i < steps else 0
        for side, sign in ((left, 1), (right, -1)):
            e = u[0] * s + v[0] * half * sign
            n = u[1] * s + v[1] * half * sign
            la, lo = offset_latlon(lat, lon, e, n)
            side.append([round(lo, 6), round(la, 6)])
    ring = left + right[::-1]
    ring.append(ring[0])
    return ring
