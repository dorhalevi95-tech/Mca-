"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Calendar, AlertCircle } from "lucide-react";
import type { WeekResult } from "@/lib/supabase";

function parseWeeks(snapshot: string | null): WeekResult[] | null {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot);
    if (Array.isArray(parsed) && parsed.length > 0 && "weekNum" in parsed[0]) {
      return parsed as WeekResult[];
    }
  } catch {}
  return null;
}

export function CheckRow({
  error,
  slotCount,
  slotsFound,
  checkedAt,
  pageSnapshot,
  index,
}: {
  error: string | null;
  slotCount: number;
  slotsFound: string[];
  checkedAt: string;
  pageSnapshot: string | null;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const failed = !!error;
  const weeks = parseWeeks(pageSnapshot);
  const hasWeeks = weeks && weeks.length > 0;

  const absDate = new Date(checkedAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const absTime = new Date(checkedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  const relativeTime = () => {
    const diff = Date.now() - new Date(checkedAt).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const totalWeeks = weeks?.length ?? 0;
  const weeksWithSlots = weeks?.filter((w) => w.slots.length > 0).length ?? 0;

  return (
    <div className={`cr ${failed ? "cr-fail" : slotCount > 0 ? "cr-slot" : "cr-ok"}`}>
      {/* Main row */}
      <div className="cr-main">
        <span className={`cr-dot ${failed ? "cd-fail" : slotCount > 0 ? "cd-slot" : "cd-ok"}`} />

        <span className="cr-seq">#{String(index + 1).padStart(3, "0")}</span>

        <div className="cr-time">
          <span className="cr-date">{absDate}</span>
          <span className="cr-clock">{absTime}</span>
        </div>

        <span className={`cr-status ${failed ? "cs-fail" : "cs-ok"}`}>
          {failed ? "FAILED" : "OK"}
        </span>

        <div className="cr-result">
          {failed ? (
            <span className="cr-err-short">
              <AlertCircle size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              Login error
            </span>
          ) : hasWeeks ? (
            <span className={slotCount > 0 ? "cr-slots-found" : "cr-no-slots"}>
              {slotCount > 0
                ? `${slotCount} open slot${slotCount > 1 ? "s" : ""} across ${weeksWithSlots} week${weeksWithSlots > 1 ? "s" : ""}`
                : `No open slots · ${totalWeeks} week${totalWeeks > 1 ? "s" : ""} checked`}
            </span>
          ) : (
            <span className="cr-no-slots">
              {slotCount > 0 ? `${slotCount} slot(s) found` : "No slots found"}
            </span>
          )}
        </div>

        <span className="cr-age">{relativeTime()}</span>

        <button
          className="cr-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "collapse" : "expand"}
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="cr-detail">
          {failed ? (
            <div className="cr-error-block">
              <div className="cr-detail-label">Error details</div>
              <pre className="cr-error-pre">{error}</pre>
            </div>
          ) : hasWeeks ? (
            <div className="cr-weeks">
              <div className="cr-detail-label">
                Week-by-week scan — {totalWeeks} week{totalWeeks > 1 ? "s" : ""} checked
              </div>
              <div className="cr-week-list">
                {weeks!.map((w) => (
                  <div key={w.weekNum} className={`cr-week ${w.slots.length > 0 ? "cw-found" : "cw-empty"}`}>
                    <div className="cw-left">
                      <Calendar size={11} className="cw-icon" />
                      <span className="cw-range">{w.dateRange}</span>
                    </div>
                    <div className="cw-right">
                      {w.slots.length > 0 ? (
                        <div className="cw-slots">
                          {w.slots.map((s, i) => (
                            <span key={i} className="cw-slot-chip">{s}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="cw-none">No open slots</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="cr-no-data">
              No week-by-week data — this check ran before per-week tracking was added.
              {slotsFound.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  Slots recorded: {slotsFound.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
