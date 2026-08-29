import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Download, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface ImportLocation { id: number; name: string }
export interface ImportInstructor { id: string; name: string }

export interface ImportedCohort {
  name: string;
  locationId: number | null;
  instructorId: string | null;
  capacity: number;
  startsDate: string;
  startsTime: string;
  endsDate: string;
  endsTime: string;
  notes: string;
  daysOfWeek: number[];
}

export interface ParseResult {
  cohorts: ImportedCohort[];
  errors: string[];
  warnings: string[];
}

const REQUIRED_HEADERS = [
  "LOCATION",
  "CAPACITY",
  "INSTRUCTOR",
  "START DT2",
  "END DT",
  "START TIME",
  "END TIME",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
  "COMMENTS",
];

// Day order in spreadsheet: MON..SUN. JS day-of-week order is Sun=0..Sat=6.
const DAY_HEADER_TO_DOW: Record<string, number> = {
  MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0,
};

function excelSerialToDateString(serial: number): string | null {
  if (typeof serial !== "number" || !isFinite(serial) || serial <= 0) return null;
  // Excel epoch: 1899-12-30 (accounts for the 1900 leap-year bug)
  const ms = Math.round(serial * 86400000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseTimeString(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  // Match "7:00 PM", "07:00 PM", "19:00", "7 PM"
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  if (ampm === "AM") {
    if (h === 12) h = 0;
  } else if (ampm === "PM") {
    if (h !== 12) h += 12;
  }
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function isXMark(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim().toUpperCase();
  return s === "X" || s === "Y" || s === "YES" || s === "TRUE" || s === "1";
}

function readSheetGrid(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) return reject(new Error("Workbook has no sheets"));
        const sheet = wb.Sheets[sheetName];
        const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null }) as unknown[][];
        resolve(grid);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function parseCohortWorkbook(
  file: File,
  expectedPackageName: string,
  locations: ImportLocation[],
  instructors: ImportInstructor[],
): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cohorts: ImportedCohort[] = [];
  let grid: unknown[][];
  try {
    grid = await readSheetGrid(file);
  } catch (e) {
    return { cohorts, errors: [`Could not read file: ${(e as Error).message}`], warnings };
  }

  if (grid.length < 2) {
    return { cohorts, errors: ["Spreadsheet is empty — expected package name in row 1 and headers in row 2."], warnings };
  }

  // Row 1: package name (typically in A1 of a merged row)
  const row1 = grid[0] || [];
  const packageNameCell = row1.find((c) => c != null && String(c).trim() !== "");
  const foundPackageName = packageNameCell != null ? String(packageNameCell).trim() : "";
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  if (!foundPackageName) {
    errors.push("Row 1 is empty — it must contain the package name.");
  } else if (norm(foundPackageName) !== norm(expectedPackageName)) {
    errors.push(`Row 1 package name mismatch. Expected "${expectedPackageName}" but found "${foundPackageName}".`);
  }

  // Row 2: headers — must match REQUIRED_HEADERS exactly (in order, case-insensitive)
  const row2 = (grid[1] || []).map((c) => (c == null ? "" : String(c).trim().toUpperCase()));
  // Trim trailing empty header cells
  while (row2.length > 0 && row2[row2.length - 1] === "") row2.pop();
  if (row2.length !== REQUIRED_HEADERS.length) {
    errors.push(`Row 2 must contain exactly these ${REQUIRED_HEADERS.length} columns in order: ${REQUIRED_HEADERS.join(", ")}.`);
  } else {
    for (let i = 0; i < REQUIRED_HEADERS.length; i++) {
      if (row2[i] !== REQUIRED_HEADERS[i]) {
        errors.push(`Row 2 column ${i + 1} should be "${REQUIRED_HEADERS[i]}" but found "${row2[i] || "(empty)"}".`);
      }
    }
  }

  if (errors.length > 0) return { cohorts, errors, warnings };

  // Build name maps for matching
  const locByName = new Map<string, number>();
  for (const l of locations) locByName.set(l.name.trim().toLowerCase(), l.id);
  const instrByName = new Map<string, string>();
  for (const i of instructors) instrByName.set(i.name.trim().toLowerCase(), i.id);

  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] || [];
    // Skip fully empty rows
    if (row.every((c) => c == null || String(c).trim() === "")) continue;
    const rowNum = r + 1; // human-friendly (1-based)

    const locName = row[0] != null ? String(row[0]).trim() : "";
    const capacityRaw = row[1];
    const instrName = row[2] != null ? String(row[2]).trim() : "";
    const startSerial = row[3];
    const endSerial = row[4];
    const startTimeRaw = row[5];
    const endTimeRaw = row[6];
    const dayCells = row.slice(7, 14);
    const comments = row[14] != null ? String(row[14]).trim() : "";

    const rowErrors: string[] = [];

    // LOCATION
    if (!locName) rowErrors.push("LOCATION is required");
    let locationId: number | null = null;
    if (locName) {
      const id = locByName.get(locName.toLowerCase());
      if (id == null) rowErrors.push(`LOCATION "${locName}" does not match any location in this school`);
      else locationId = id;
    }

    // CAPACITY
    let capacity = 0;
    if (capacityRaw == null || String(capacityRaw).trim() === "") {
      rowErrors.push("CAPACITY is required");
    } else {
      const n = Number(capacityRaw);
      if (!Number.isInteger(n) || n <= 0) rowErrors.push(`CAPACITY must be a positive integer (got "${capacityRaw}")`);
      else capacity = n;
    }

    // INSTRUCTOR (optional)
    let instructorId: string | null = null;
    if (instrName) {
      const id = instrByName.get(instrName.toLowerCase());
      if (id == null) {
        warnings.push(`Row ${rowNum}: INSTRUCTOR "${instrName}" not found — cohort will be created without an instructor.`);
      } else {
        instructorId = id;
      }
    }

    // Dates
    const startsDate = typeof startSerial === "number"
      ? excelSerialToDateString(startSerial)
      : (typeof startSerial === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startSerial.trim()) ? startSerial.trim() : null);
    if (!startsDate) rowErrors.push(`START DT2 must be a date (got "${startSerial ?? ""}")`);
    const endsDate = typeof endSerial === "number"
      ? excelSerialToDateString(endSerial)
      : (typeof endSerial === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endSerial.trim()) ? endSerial.trim() : null);
    if (!endsDate) rowErrors.push(`END DT must be a date (got "${endSerial ?? ""}")`);
    if (startsDate && endsDate && endsDate < startsDate) rowErrors.push("END DT must be on or after START DT2");

    // Times
    const startsTime = parseTimeString(startTimeRaw);
    if (!startsTime) rowErrors.push(`START TIME must be a time like "7:00 PM" (got "${startTimeRaw ?? ""}")`);
    const endsTime = parseTimeString(endTimeRaw);
    if (!endsTime) rowErrors.push(`END TIME must be a time like "9:00 PM" (got "${endTimeRaw ?? ""}")`);
    if (startsTime && endsTime && endsTime <= startsTime) rowErrors.push("END TIME must be after START TIME");

    // Days of week
    const daysOfWeek: number[] = [];
    const headerOrder = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    headerOrder.forEach((h, i) => {
      if (isXMark(dayCells[i])) daysOfWeek.push(DAY_HEADER_TO_DOW[h]);
    });
    if (daysOfWeek.length === 0) rowErrors.push("At least one day of the week (MON–SUN) must be marked with X");

    if (rowErrors.length > 0) {
      errors.push(`Row ${rowNum}: ${rowErrors.join("; ")}`);
      continue;
    }

    cohorts.push({
      name: `${locName} — ${startsDate}${startsTime ? ` ${startsTime}` : ""}`,
      locationId,
      instructorId,
      capacity,
      startsDate: startsDate!,
      startsTime: startsTime!,
      endsDate: endsDate!,
      endsTime: endsTime!,
      notes: comments,
      daysOfWeek,
    });
  }

  if (cohorts.length === 0 && errors.length === 0) {
    errors.push("No data rows found below the header.");
  }

  return { cohorts, errors, warnings };
}

export function downloadCohortTemplate(packageName: string) {
  const wb = XLSX.utils.book_new();
  const aoa: unknown[][] = [
    [packageName],
    REQUIRED_HEADERS,
    [
      "Main Campus",         // LOCATION
      20,                    // CAPACITY
      "",                    // INSTRUCTOR (optional)
      "2026-06-01",          // START DT2
      "2026-06-30",          // END DT
      "7:00 PM",             // START TIME
      "9:00 PM",             // END TIME
      "X", "X", "X", "X", "", "", "",  // MON-SUN
      "Sample evening cohort",          // COMMENTS
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Merge row 1 across all 15 columns for readability
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: REQUIRED_HEADERS.length - 1 } }];
  XLSX.utils.book_append_sheet(wb, ws, "Cohorts");
  const safe = packageName.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "cohorts";
  XLSX.writeFile(wb, `${safe}_cohorts_template.xlsx`);
}

interface CohortImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageName: string;
  locations: ImportLocation[];
  instructors: ImportInstructor[];
  onImport: (cohorts: ImportedCohort[]) => void;
}

export function CohortImportDialog({ open, onOpenChange, packageName, locations, instructors, onImport }: CohortImportDialogProps) {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const r = await parseCohortWorkbook(file, packageName, locations, instructors);
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  function handleConfirm() {
    if (result && result.errors.length === 0 && result.cohorts.length > 0) {
      onImport(result.cohorts);
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="dialog-cohort-import">
        <DialogHeader>
          <DialogTitle>Import cohorts from Excel</DialogTitle>
          <DialogDescription>
            Row 1 must be the package name <strong>"{packageName}"</strong>. Row 2 must contain these headers in order:
            {" "}{REQUIRED_HEADERS.join(", ")}. Each subsequent row creates one cohort with recurring sessions on the days marked with X.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadCohortTemplate(packageName)}
              data-testid="button-download-template"
            >
              <Download className="h-4 w-4 mr-1" /> Download template
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              data-testid="input-import-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              data-testid="button-pick-file"
            >
              <Upload className="h-4 w-4 mr-1" /> {busy ? "Reading…" : "Choose file"}
            </Button>
          </div>

          {result && result.errors.length > 0 && (
            <Alert variant="destructive" data-testid="alert-import-errors">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-1">Import blocked — fix these issues and re-upload:</div>
                <ScrollArea className="max-h-40">
                  <ul className="list-disc pl-4 space-y-0.5 text-xs">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {result && result.errors.length === 0 && (
            <Alert data-testid="alert-import-ready">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Ready to import <strong>{result.cohorts.length}</strong> cohort{result.cohorts.length === 1 ? "" : "s"}.
                {result.warnings.length > 0 && (
                  <ScrollArea className="max-h-32 mt-2">
                    <div className="text-xs space-y-0.5">
                      {result.warnings.map((w, i) => (
                        <div key={i} className="text-amber-600 dark:text-amber-400">{w}</div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </AlertDescription>
            </Alert>
          )}

          {result && result.cohorts.length > 0 && (
            <ScrollArea className="max-h-64 border rounded">
              <div className="p-2 space-y-1">
                {result.cohorts.map((c, i) => (
                  <div key={i} className="text-xs flex flex-wrap items-center gap-1.5" data-testid={`row-preview-${i}`}>
                    <Badge variant="outline">{i + 1}</Badge>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">cap {c.capacity}</span>
                    <span className="text-muted-foreground">{c.startsDate} → {c.endsDate}</span>
                    <span className="text-muted-foreground">{c.startsTime}–{c.endsTime}</span>
                    <span className="text-muted-foreground">days {c.daysOfWeek.sort().join(",")}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }} data-testid="button-cancel-import">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!result || result.errors.length > 0 || result.cohorts.length === 0}
            data-testid="button-confirm-import"
          >
            Import {result?.cohorts.length ? `${result.cohorts.length} cohort${result.cohorts.length === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
