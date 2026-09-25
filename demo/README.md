# Demo submissions: Dunes Energy Company (fictional)

Realistic GHG submission packages for the live demo. They follow the files that Abu Dhabi facilities actually send to the Environment
Agency – Abu Dhabi (EAD) under Federal Decree-Law No. 11 of 2024. Every company, person, number and certificate is invented, and each
PDF says so in its footer.

- **Operator:** Dunes Energy Company (شركة الكثبان للطاقة). This is the same fictional oil and gas operator used in the app's sample inbox.
- **Eastern Dunes CPF-1** (`AD-OG-0412`): a clean submission. Expected result: **compliant**.
- **Southern Dunes CPF-2** (`AD-OG-0417`): planted problems (missing methane methodology, an undeclared flare-meter gap, low figures
  compared with peers, satellite signals). Expected result: **non-compliant**. See [ANSWER-KEY.md](ANSWER-KEY.md).

## What a facility actually submits (Abu Dhabi)

| Step | What | When | Source |
|---|---|---|---|
| Registration | Facility registration with EAD. Holders of an environmental permit are registered automatically. | By 31 March | EAD Technical Guidance (TGD) Step 1 |
| Monitoring Plan | How emissions are measured: facility description, site schematic, methods, meters, QA/QC, data-gap procedure. | Within 90 days of registration, then by 1 April each year; revised within 30 days of significant changes | TGD Step 2 |
| Emissions report | EAD's Excel reporting template: sheets A to K covering identifiers, facility description, source streams, calculations, methane, data gaps, QA and mitigation. Minimum content: total GHG, emissions by source and gas, methods, deviations from the plan, verification statement. | 31 March (grace period to 14 April) | TGD Step 3; EAD workshop, 12 Mar 2026 |
| Verification | Statement from an accredited verifier (ISO 14065), with a site visit. EAD says this is voluntary until 2027. | Submitted with the report | TGD Step 4; EAD workshop, 12 Mar 2026 |
| Evidence | Invoices, meter records, calibration certificates and lab analyses. EAD accepts documents in place of meters. | With the report or on request | TGD FAQ Q3 |
| Corrections | Errors are corrected within 30 days of being found. | On discovery | TGD Step 5 |

Scope: direct (Scope 1) CO2 and CH4. Sectors: power, oil and gas, industry. Threshold: 25,000 t CO2e a year. Submissions go through the
EAD facility MRV portal (facilitymrv.ead.ae). Abu Dhabi facilities report to EAD, not separately to the ministry.

Sources: [EAD Technical Guidance v5](https://facilitymrv.ead.ae/appDocuments/20250303%20-%20Technical%20Guidance%20v5%20-%20No%20Cover.pdf),
[EAD MRV workshop, March 2026](https://facilitymrv.ead.ae/appDocuments/20260312_EAD%20MRV_%20Workshop%20Presentation.pdf),
[Decree-Law 11/2024](https://uaelegislation.gov.ae/en/legislations/2558).

## Folder map

```
submissions/<facility>/                      What the company uploads
  *_Cover-Letter_RY2025.pdf                  Submission letter to EAD, emissions summary, operator declaration
  *_EAD-MRV-Emissions-Report_RY2025.xlsx     The report itself (EAD template structure, sheets A to K)
  *_Monitoring-Plan_Rev*.pdf                 Monitoring Plan with site schematic (Figure 1)
  *_Verification-Statement_RY2025.pdf        Third-party verifier's opinion and findings
  evidence/
    *_Fuel-Gas-Meter-FT3001_Monthly_2025.csv  Fuel gas meter totals (source stream SS-01)
    *_Flare-Log_Daily_2025.csv                Daily HP/LP flare volumes, data source, pilot status, events
    *_Diesel-Invoices_2025.csv                Diesel deliveries (SS-04)
    *_Production-and-Gas-Balance_Monthly_2025.csv  Oil and gas production; flared gas by balance
    *_Gas-Analysis-Certificate_2025.pdf       Lab analysis (quarterly GC), NCV and emission factors
    *_Meter-Calibration-Certificates.pdf      Calibration certificates for FT-3001, FT-5101, FT-5102
    *_LDAR-Survey-Summary_2025.pdf            Leak survey (Eastern Dunes only; Southern Dunes has none)

regulator-reference-SIMULATED/               Government-side data (not submitted by the company)
  peer-benchmarks_onshore-oil-CPF_RY2025.csv  Eight similar facilities: intensity, methane, flaring
  prior-year-submissions_RY2024.csv          Last year's figures for both Dunes facilities
  satellite-methane-detections_2025_SIMULATED.geojson  Plume points and polygons for the map
```

## Suggested 90-second demo flow

1. Drop in **Eastern Dunes**. It passes. Point out that the AI even explains its one satellite detection with a declared blowdown.
2. Drop in **Southern Dunes**. It is flagged red. Show three findings: the missing methane methodology (sheet G versus the Monitoring Plan), the
   flare meter estimates contradicting the gas balance, and the satellite plume on the day of the flare flame-out.
3. Show the peer chart. Southern Dunes is the lowest emitter per barrel until it is corrected, then it sits in line with its peers.
4. Click "Draft query" to get a bilingual letter citing TGD Step 5 (correct within 30 days) and Decree-Law 11/2024 Articles 6 and 15.

## Honesty notes for judges

- The workbook recreates the **structure** of EAD's template from the published guidance. It is not the official file.
- Satellite detections and peer data are **simulated**. Present them as "a signal to investigate", never as proof.
- Coordinates are illustrative. Before showing a map, check that they don't sit on a real facility.
- The operator is deliberately not ADNOC or any real company.

## Regenerating

```bash
python3 demo/_generator/generate.py   # needs Python 3.10+, openpyxl, Google Chrome; pypdf optional (PDF metadata)
```

Everything comes from `demo/_generator/model.py`, so change numbers, names or planted issues there. The Excel sheets are built in
`xlsx_report.py`, the PDFs in `pdf_docs.py`, and `ANSWER-KEY.md` is rewritten on every run.
