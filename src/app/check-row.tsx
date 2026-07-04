"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function CheckRow({
  error,
  slotCount,
  slotsFound,
  checkedAt,
  index,
}: {
  error: string | null;
  slotCount: number;
  slotsFound: string[];
  checkedAt: string;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const failed = !!error;
  const hasSlots = slotCount > 0;

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const absTime = new Date(checkedAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div
      className={`check-row ${failed ? "failed" : hasSlots ? "slots" : "ok"}`}
      data-index={index}
    >
      <div className="row-main">
        <span className={`status-dot ${failed ? "dot-fail" : hasSlots ? "dot-slot" : "dot-ok"}`} />

        <span className="row-seq">#{String(index + 1).padStart(3, "0")}</span>

        <span className="row-abs">{absTime}</span>
        <span className="row-rel">{relativeTime(checkedAt)}</span>

        <span className={`row-outcome ${failed ? "outcome-fail" : hasSlots ? "outcome-slot" : "outcome-ok"}`}>
          {failed
            ? "LOGIN FAILED"
            : hasSlots
            ? `${slotCount} SLOT${slotCount > 1 ? "S" : ""} FOUND`
            : "NO SLOTS"}
        </span>

        {(failed || hasSlots) && (
          <button
            className="expand-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "collapse" : "expand"}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {expanded && (
        <div className="row-detail">
          {failed ? (
            <pre className="detail-error">{error}</pre>
          ) : (
            <ul className="detail-slots">
              {slotsFound.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
