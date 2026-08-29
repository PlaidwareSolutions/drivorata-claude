export interface RecurrenceSpec {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
}

export interface Occurrence {
  startAt: Date;
  endAt: Date;
}

export interface AvailabilityBlock {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  type: string;
  locationId: number | null;
}

export function buildOccurrences(spec: RecurrenceSpec): Occurrence[] {
  const out: Occurrence[] = [];
  const [sY, sM, sD] = spec.startDate.split("-").map(Number);
  const [eY, eM, eD] = spec.endDate.split("-").map(Number);
  const [sh, sm] = spec.startTime.split(":").map(Number);
  const [eh, em] = spec.endTime.split(":").map(Number);
  if (eh * 60 + em <= sh * 60 + sm) return out;
  const cur = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
  const last = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
  let safety = 0;
  while (cur <= last && safety < 1000) {
    if (spec.daysOfWeek.includes(cur.getDay())) {
      const startAt = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), sh, sm, 0, 0);
      const endAt = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), eh, em, 0, 0);
      out.push({ startAt, endAt });
    }
    cur.setDate(cur.getDate() + 1);
    safety++;
  }
  return out;
}

export function checkAvailabilityCoverage(
  blocks: AvailabilityBlock[],
  occurrence: Occurrence,
  type: "CLASSROOM" | "DRIVE",
  locationId: number | null | undefined,
): { hasAny: boolean; covered: boolean } {
  if (blocks.length === 0) return { hasAny: false, covered: true };
  const dow = occurrence.startAt.getDay();
  const startMin = occurrence.startAt.getHours() * 60 + occurrence.startAt.getMinutes();
  const endMin = occurrence.endAt.getHours() * 60 + occurrence.endAt.getMinutes();
  const candidates = blocks.filter(
    (b) =>
      b.dayOfWeek === dow &&
      (b.type === type || b.type === "BOTH") &&
      (b.locationId == null || locationId == null || b.locationId === locationId),
  );
  for (const b of candidates) {
    const [bsh, bsm] = b.startTime.split(":").map(Number);
    const [beh, bem] = b.endTime.split(":").map(Number);
    const bStart = bsh * 60 + bsm;
    const bEnd = beh * 60 + bem;
    if (bStart <= startMin && bEnd >= endMin) return { hasAny: true, covered: true };
  }
  return { hasAny: true, covered: false };
}
