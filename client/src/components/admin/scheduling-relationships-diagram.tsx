import { cn } from "@/lib/utils";

interface SchedulingRelationshipsDiagramProps {
  className?: string;
}

export function SchedulingRelationshipsDiagram({
  className,
}: SchedulingRelationshipsDiagramProps) {
  return (
    <svg
      viewBox="0 0 1280 820"
      role="img"
      aria-labelledby="scheduling-diagram-title scheduling-diagram-desc"
      className={cn("w-full h-auto select-none", className)}
      data-testid="svg-scheduling-relationships"
    >
      <title id="scheduling-diagram-title">Scheduling — relationships</title>
      <desc id="scheduling-diagram-desc">
        How Package, Schedule Offering, Schedule Session, Private Lesson and
        Driving Test relate. Private Lesson and Driving Test are standalone
        Schedule Sessions with offering_id NULL, distinguished by their type.
      </desc>

      <defs>
        <marker
          id="arrow-solid"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
        <marker
          id="arrow-dashed"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {/* Title */}
      <text
        x="640"
        y="34"
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: 20, fontWeight: 700 }}
      >
        Scheduling — relationships
      </text>
      <text
        x="640"
        y="58"
        textAnchor="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 12 }}
      >
        How Package, Schedule Offering, Schedule Session, Private Lesson, and
        Driving Test connect
      </text>

      {/* ===== Left column: Cart Item, Package ===== */}
      <EntityBox
        x={30}
        y={90}
        w={180}
        h={60}
        label="Cart Item"
        testId="diagram-box-cart-item"
      />
      <EntityBox
        x={30}
        y={210}
        w={180}
        h={60}
        label="Package"
        testId="diagram-box-package"
      />

      {/* ===== Center column: Schedule Offering, Schedule Session ===== */}
      <EntityBox
        x={500}
        y={130}
        w={240}
        h={80}
        label="Schedule Offering"
        sublabel="cohort / class section"
        testId="diagram-box-schedule-offering"
        emphasis
      />
      <EntityBox
        x={500}
        y={310}
        w={240}
        h={90}
        label="Schedule Session"
        sublabel="offering_id is NULLABLE"
        detail="(standalone sessions allowed)"
        testId="diagram-box-schedule-session"
        emphasis
      />

      {/* ===== Right column: Enrollment, Offering Waitlist ===== */}
      <EntityBox
        x={1030}
        y={90}
        w={220}
        h={60}
        label="Enrollment"
        testId="diagram-box-enrollment"
      />
      <EntityBox
        x={1030}
        y={210}
        w={220}
        h={60}
        label="Offering Waitlist"
        testId="diagram-box-offering-waitlist"
      />

      {/* ===== FK targets (right of Schedule Session) ===== */}
      <EntityBox
        x={830}
        y={310}
        w={150}
        h={50}
        label="Vehicle"
        testId="diagram-box-vehicle"
      />
      <EntityBox
        x={1000}
        y={310}
        w={150}
        h={50}
        label="Instructor"
        testId="diagram-box-instructor"
      />
      <EntityBox
        x={1170}
        y={310}
        w={90}
        h={50}
        label="Location"
        testId="diagram-box-location"
      />

      {/* ===== Variants below Schedule Session ===== */}
      <EntityBox
        x={350}
        y={500}
        w={240}
        h={100}
        label="Private Lesson"
        sublabel="standalone session"
        detail="type=DRIVE · offering_id=NULL · cap 1"
        testId="diagram-box-private-lesson"
        variant
      />
      <EntityBox
        x={650}
        y={500}
        w={240}
        h={100}
        label="Driving Test"
        sublabel="standalone session"
        detail="type=ROAD_TEST · offering_id=NULL · cap 1"
        testId="diagram-box-driving-test"
        variant
      />

      {/* ===== Connectors ===== */}
      {/* Cart Item -> Package (required) */}
      <Connector
        d="M 120 150 L 120 210"
        label="package_id (required)"
        labelX={120}
        labelY={183}
        labelBg
      />

      {/* Cart Item -> Schedule Offering (optional) */}
      <Connector
        d="M 210 120 L 500 150"
        label="offering_id (optional)"
        labelX={355}
        labelY={128}
        labelBg
      />

      {/* Package -> Schedule Offering (1:N via package_id required FK) */}
      <Connector
        d="M 210 240 L 500 195"
        label="package_id (required)"
        labelX={355}
        labelY={222}
        labelBg
      />

      {/* Enrollment -> Schedule Offering */}
      <Connector
        d="M 1030 120 L 740 150"
        label="offering_id (enrolled in)"
        labelX={885}
        labelY={128}
        labelBg
      />

      {/* Offering Waitlist -> Schedule Offering */}
      <Connector
        d="M 1030 240 L 740 195"
        label="offering_id (waiting for)"
        labelX={885}
        labelY={222}
        labelBg
      />

      {/* Schedule Offering -> Schedule Session (1..N, generated) */}
      <Connector
        d="M 620 210 L 620 310"
        label="1..N — Generate Sessions wizard"
        labelX={620}
        labelY={263}
        labelBg
      />

      {/* Enrollment -> Schedule Session (books per-meeting) */}
      <Connector
        d="M 1140 150 C 1140 270, 760 270, 740 320"
        label="books (atomic)"
        labelX={950}
        labelY={258}
        labelBg
      />

      {/* Schedule Session -> FK targets */}
      <Connector
        d="M 740 335 L 830 335"
        label="FK (set null)"
        labelX={785}
        labelY={326}
        labelBg
      />
      <Connector d="M 980 335 L 1000 335" />
      <Connector d="M 1150 335 L 1170 335" />
      <text
        x={1075}
        y={380}
        textAnchor="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 10 }}
      >
        FK (set null on delete)
      </text>

      {/* Variants -> Schedule Session (dashed "is a") */}
      <Connector d="M 470 500 L 560 400" dashed />
      <Connector d="M 770 500 L 680 400" dashed />
      <text
        x={620}
        y={455}
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: 10.5 }}
      >
        is a (variant of Schedule Session)
      </text>

      {/* ===== Legend ===== */}
      <g transform="translate(20, 640)">
        <rect
          x="0"
          y="0"
          width="1240"
          height="160"
          rx="8"
          className="fill-muted/30 stroke-border"
          strokeWidth={1}
        />
        <text
          x="16"
          y="24"
          className="fill-foreground"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          Legend
        </text>

        {/* Solid arrow */}
        <g transform="translate(16, 40)" className="text-muted-foreground">
          <line
            x1="0"
            y1="10"
            x2="40"
            y2="10"
            stroke="currentColor"
            strokeWidth={1.5}
            markerEnd="url(#arrow-solid)"
          />
          <text
            x="52"
            y="14"
            className="fill-foreground"
            style={{ fontSize: 12 }}
          >
            Foreign-key relationship
          </text>
        </g>

        {/* Dashed arrow */}
        <g transform="translate(260, 40)" className="text-muted-foreground">
          <line
            x1="0"
            y1="10"
            x2="40"
            y2="10"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            markerEnd="url(#arrow-dashed)"
          />
          <text
            x="52"
            y="14"
            className="fill-foreground"
            style={{ fontSize: 12 }}
          >
            Variant / conceptual link
          </text>
        </g>

        {/* Entity box */}
        <g transform="translate(500, 30)">
          <rect
            x="0"
            y="0"
            width="40"
            height="22"
            rx="4"
            className="fill-background stroke-foreground"
            strokeWidth={1.5}
          />
          <text
            x="52"
            y="16"
            className="fill-foreground"
            style={{ fontSize: 12 }}
          >
            Entity (table)
          </text>
        </g>

        {/* Variant box */}
        <g transform="translate(700, 30)">
          <rect
            x="0"
            y="0"
            width="40"
            height="22"
            rx="4"
            strokeDasharray="4 3"
            className="fill-background stroke-foreground"
            strokeWidth={1.5}
          />
          <text
            x="52"
            y="16"
            className="fill-foreground"
            style={{ fontSize: 12 }}
          >
            Variant (concept)
          </text>
        </g>

        {/* Emphasized entity */}
        <g transform="translate(900, 30)">
          <rect
            x="0"
            y="0"
            width="40"
            height="22"
            rx="4"
            className="fill-background stroke-primary"
            strokeWidth={2}
          />
          <text
            x="52"
            y="16"
            className="fill-foreground"
            style={{ fontSize: 12 }}
          >
            Primary scheduling entity
          </text>
        </g>

        {/* sessionTypeEnum */}
        <text
          x="16"
          y="92"
          className="fill-foreground"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          sessionTypeEnum:
        </text>
        <text
          x="130"
          y="92"
          className="fill-muted-foreground"
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          CLASSROOM · DRIVE · BTW_OBSERVATION · BTW_PRACTICE · ROAD_TEST
        </text>

        <text
          x="16"
          y="118"
          className="fill-muted-foreground"
          style={{ fontSize: 11 }}
        >
          Private Lesson and Driving Test are not separate tables — they are
          standalone Schedule Sessions (offering_id NULL) distinguished by
          type.
        </text>
        <text
          x="16"
          y="138"
          className="fill-muted-foreground"
          style={{ fontSize: 11 }}
        >
          Schedule Offering → Schedule Session is 1..N: the Generate Sessions
          wizard creates one session per meeting in the cohort's schedule.
        </text>
      </g>
    </svg>
  );
}

interface EntityBoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sublabel?: string;
  detail?: string;
  testId: string;
  emphasis?: boolean;
  variant?: boolean;
}

function EntityBox({
  x,
  y,
  w,
  h,
  label,
  sublabel,
  detail,
  testId,
  emphasis,
  variant,
}: EntityBoxProps) {
  const hasMeta = !!(sublabel || detail);
  const labelY = hasMeta ? y + 26 : y + h / 2 + 5;
  return (
    <g data-testid={testId}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        className={cn(
          "fill-background",
          emphasis ? "stroke-primary" : "stroke-foreground",
        )}
        strokeWidth={emphasis ? 2 : 1.5}
        strokeDasharray={variant ? "4 3" : undefined}
      />
      <text
        x={x + w / 2}
        y={labelY}
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: 14, fontWeight: 600 }}
      >
        {label}
      </text>
      {sublabel && (
        <text
          x={x + w / 2}
          y={y + 46}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 11 }}
        >
          {sublabel}
        </text>
      )}
      {detail && (
        <text
          x={x + w / 2}
          y={y + h - 12}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{
            fontSize: 10,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          {detail}
        </text>
      )}
    </g>
  );
}

interface ConnectorProps {
  d: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  dashed?: boolean;
  bidirectional?: boolean;
  labelBg?: boolean;
}

function Connector({
  d,
  label,
  labelX,
  labelY,
  dashed,
  bidirectional,
  labelBg,
}: ConnectorProps) {
  const labelWidth = label ? label.length * 6.2 : 0;
  return (
    <g className="text-muted-foreground">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray={dashed ? "4 3" : undefined}
        markerEnd={dashed ? "url(#arrow-dashed)" : "url(#arrow-solid)"}
        markerStart={bidirectional ? "url(#arrow-solid)" : undefined}
      />
      {label && labelX !== undefined && labelY !== undefined && (
        <>
          {labelBg && (
            <rect
              x={labelX - labelWidth / 2 - 4}
              y={labelY - 9}
              width={labelWidth + 8}
              height={13}
              rx={3}
              className="fill-background"
            />
          )}
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            className="fill-foreground"
            style={{ fontSize: 10.5 }}
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
}
