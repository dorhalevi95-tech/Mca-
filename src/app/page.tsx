import { supabase, type Check, type Notification } from "@/lib/supabase";
import { Calendar, Bell, AlertTriangle, TrendingUp, Clock, Activity } from "lucide-react";
import { CheckRow } from "./check-row";

const TARGET_DATE = process.env.TARGET_DATE ?? "2025-11-25";

async function getChecks(): Promise<Check[]> {
  const { data } = await supabase
    .from("checks")
    .select("id,checked_at,slot_count,slots_found,error")
    .order("checked_at", { ascending: false })
    .limit(100);
  return (data as Check[]) ?? [];
}

async function getNotifications(): Promise<Notification[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("notified_at", { ascending: false })
    .limit(20);
  return (data as Notification[]) ?? [];
}

export const dynamic = "force-dynamic";

export default async function Home() {
  const [checks, notifications] = await Promise.all([getChecks(), getNotifications()]);

  const total = checks.length;
  const failed = checks.filter((c) => !!c.error).length;
  const succeeded = total - failed;
  const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;
  const latest = checks[0];
  const lastSuccess = checks.find((c) => !c.error);

  // Consecutive failures from newest
  let streak = 0;
  for (const c of checks) {
    if (c.error) streak++;
    else break;
  }

  const hasEarlierSlot = checks.some((c) =>
    c.slots_found?.some((s) => {
      const d = new Date(s);
      return !isNaN(d.getTime()) && d < new Date(TARGET_DATE);
    })
  );

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  return (
    <>
      <style>{`
        :root {
          --bg:       #080F1A;
          --surface:  #0D1B2E;
          --border:   #162840;
          --border2:  #1E3A5A;
          --txt:      #C8DCF0;
          --muted:    #4E6E8E;
          --accent:   #1CABB8;
          --green:    #2EBF7A;
          --red:      #D94F4F;
          --yellow:   #C8A838;
          --mono:     ui-monospace, "Cascadia Code", "Fira Code", "Consolas", monospace;
          --sans:     system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        @media (prefers-color-scheme: light) {
          :root {
            --bg:      #F0F5FA;
            --surface: #FFFFFF;
            --border:  #D0DDE8;
            --border2: #B0C4D8;
            --txt:     #162840;
            --muted:   #6888A4;
            --accent:  #0E8FA0;
            --green:   #1E9B5A;
            --red:     #C03030;
            --yellow:  #9A7A18;
          }
        }
        :root[data-theme="dark"] {
          --bg:       #080F1A;
          --surface:  #0D1B2E;
          --border:   #162840;
          --border2:  #1E3A5A;
          --txt:      #C8DCF0;
          --muted:    #4E6E8E;
          --accent:   #1CABB8;
          --green:    #2EBF7A;
          --red:      #D94F4F;
          --yellow:   #C8A838;
        }
        :root[data-theme="light"] {
          --bg:      #F0F5FA;
          --surface: #FFFFFF;
          --border:  #D0DDE8;
          --border2: #B0C4D8;
          --txt:     #162840;
          --muted:   #6888A4;
          --accent:  #0E8FA0;
          --green:   #1E9B5A;
          --red:     #C03030;
          --yellow:  #9A7A18;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--txt); font-family: var(--sans); font-size: 14px; line-height: 1.5; }

        .shell { max-width: 1000px; margin: 0 auto; padding: 24px 16px 64px; }

        /* ── Header ── */
        .header { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
        .header-icon { color: var(--accent); flex-shrink: 0; margin-top: 2px; }
        .header-title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--txt); }
        .header-sub { font-size: 12px; color: var(--muted); margin-top: 2px; font-family: var(--mono); }
        .header-target { color: var(--accent); }
        .header-alert { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 4px; white-space: nowrap; }
        .alert-good { background: rgba(46,191,122,0.12); border: 1px solid rgba(46,191,122,0.35); color: var(--green); }
        .alert-watch { background: rgba(217,79,79,0.12); border: 1px solid rgba(217,79,79,0.35); color: var(--red); }

        /* ── Stats rail ── */
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
        .stat { background: var(--surface); padding: 16px 20px; }
        .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
        .stat-value { font-family: var(--mono); font-size: 26px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
        .stat-sub { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-top: 4px; }
        .val-green { color: var(--green); }
        .val-red { color: var(--red); }
        .val-accent { color: var(--accent); }
        .val-yellow { color: var(--yellow); }

        /* ── Streak warning ── */
        .streak-warn { display: flex; align-items: center; gap: 8px; background: rgba(217,79,79,0.08); border: 1px solid rgba(217,79,79,0.3); border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 13px; color: var(--red); }
        .streak-warn svg { flex-shrink: 0; }

        /* ── Notifications ── */
        .notif-section { margin-bottom: 24px; }
        .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
        .notif-list { display: flex; flex-direction: column; gap: 6px; }
        .notif-row { display: flex; justify-content: space-between; align-items: center; background: rgba(200,168,56,0.08); border: 1px solid rgba(200,168,56,0.25); border-radius: 5px; padding: 8px 12px; }
        .notif-slot { font-family: var(--mono); font-size: 13px; color: var(--yellow); font-weight: 600; }
        .notif-time { font-family: var(--mono); font-size: 11px; color: var(--muted); }

        /* ── Log table ── */
        .log-section {}
        .log-header { display: grid; grid-template-columns: 8px 52px 1fr 80px 130px 20px; gap: 0 12px; align-items: center; padding: 6px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); border-bottom: 1px solid var(--border); margin-bottom: 4px; }
        .log-list { display: flex; flex-direction: column; gap: 2px; }

        /* ── Check rows ── */
        .check-row { border-radius: 5px; overflow: hidden; border: 1px solid var(--border); background: var(--surface); }
        .check-row.failed { border-color: rgba(217,79,79,0.25); }
        .check-row.slots  { border-color: rgba(200,168,56,0.35); background: rgba(200,168,56,0.04); }
        .row-main { display: grid; grid-template-columns: 8px 52px 1fr 80px 130px 20px; gap: 0 12px; align-items: center; padding: 8px 12px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .dot-ok   { background: var(--green); box-shadow: 0 0 4px var(--green); }
        .dot-fail { background: var(--red);   box-shadow: 0 0 4px var(--red); }
        .dot-slot { background: var(--yellow); box-shadow: 0 0 4px var(--yellow); }
        .row-seq { font-family: var(--mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
        .row-abs { font-family: var(--mono); font-size: 12px; color: var(--txt); font-variant-numeric: tabular-nums; }
        .row-rel { font-family: var(--mono); font-size: 11px; color: var(--muted); text-align: right; }
        .row-outcome { font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-align: right; }
        .outcome-ok   { color: var(--green); }
        .outcome-fail { color: var(--red); }
        .outcome-slot { color: var(--yellow); }
        .expand-btn { background: none; border: none; cursor: pointer; color: var(--muted); display: flex; align-items: center; justify-content: flex-end; padding: 0; }
        .expand-btn:hover { color: var(--txt); }
        .expand-btn:focus-visible { outline: 2px solid var(--accent); border-radius: 2px; }

        .row-detail { padding: 0 12px 10px; }
        .detail-error { font-family: var(--mono); font-size: 11px; color: var(--red); white-space: pre-wrap; word-break: break-all; background: rgba(217,79,79,0.06); border: 1px solid rgba(217,79,79,0.15); border-radius: 4px; padding: 8px 10px; max-height: 200px; overflow-y: auto; }
        .detail-slots { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
        .detail-slots li { font-family: var(--mono); font-size: 12px; background: rgba(200,168,56,0.12); border: 1px solid rgba(200,168,56,0.3); border-radius: 3px; padding: 2px 8px; color: var(--yellow); }

        .empty-state { text-align: center; padding: 48px 0; color: var(--muted); font-size: 13px; }

        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border); text-align: center; font-size: 11px; color: var(--muted); font-family: var(--mono); }

        @media (max-width: 640px) {
          .stats { grid-template-columns: repeat(2, 1fr); }
          .log-header { display: none; }
          .row-main { grid-template-columns: 8px 1fr auto; gap: 0 8px; }
          .row-seq, .row-rel { display: none; }
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <div className="shell">

        {/* Header */}
        <div className="header">
          <Calendar className="header-icon" size={22} />
          <div>
            <div className="header-title">MCA Oral Exam — Slot Monitor</div>
            <div className="header-sub">
              Watching for cancellations before{" "}
              <span className="header-target">{TARGET_DATE}</span>
              {" "}· Chief Engineer Unlimited (SVE &lt;500 GT / 3000 kW)
            </div>
          </div>
          {hasEarlierSlot ? (
            <div className="header-alert alert-good">
              <Activity size={13} /> Earlier slot available
            </div>
          ) : streak >= 3 ? (
            <div className="header-alert alert-watch">
              <AlertTriangle size={13} /> {streak} consecutive failures
            </div>
          ) : null}
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat">
            <div className="stat-label"><TrendingUp size={11} /> Total attempts</div>
            <div className={`stat-value val-accent`}>{total}</div>
            <div className="stat-sub">{succeeded} login OK · {failed} failed</div>
          </div>
          <div className="stat">
            <div className="stat-label">Success rate</div>
            <div className={`stat-value ${successRate >= 75 ? "val-green" : successRate >= 40 ? "val-yellow" : "val-red"}`}>
              {successRate}<span style={{ fontSize: 14 }}>%</span>
            </div>
            <div className="stat-sub">portal logins completed</div>
          </div>
          <div className="stat">
            <div className="stat-label"><Clock size={11} /> Last attempt</div>
            <div className="stat-value" style={{ fontSize: 14, lineHeight: 1.4 }}>
              {latest ? fmtTime(latest.checked_at) : "—"}
            </div>
            <div className={`stat-sub ${latest?.error ? "val-red" : "val-green"}`}>
              {latest?.error ? "failed" : "succeeded"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Last success</div>
            <div className="stat-value" style={{ fontSize: 14, lineHeight: 1.4 }}>
              {lastSuccess ? fmtTime(lastSuccess.checked_at) : "—"}
            </div>
            <div className="stat-sub" style={{ color: streak > 0 ? "var(--red)" : "var(--muted)" }}>
              {streak > 0 ? `${streak} fail streak` : "no streak"}
            </div>
          </div>
        </div>

        {/* Streak warning */}
        {streak >= 3 && (
          <div className="streak-warn">
            <AlertTriangle size={16} />
            <span>
              <strong>{streak} consecutive login failures.</strong>{" "}
              The MCA portal may have changed or the session flow is broken.
              Check the error details below.
            </span>
          </div>
        )}

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="notif-section">
            <div className="section-title">
              <Bell size={11} /> Email alerts sent ({notifications.length})
            </div>
            <div className="notif-list">
              {notifications.map((n) => (
                <div key={n.id} className="notif-row">
                  <span className="notif-slot">{n.slot_label}</span>
                  <span className="notif-time">{fmtTime(n.notified_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Log */}
        <div className="log-section">
          <div className="section-title" style={{ marginBottom: 6 }}>
            <Activity size={11} /> Login attempt log ({total})
          </div>
          <div className="log-header">
            <span />
            <span>#</span>
            <span>Timestamp</span>
            <span style={{ textAlign: "right" }}>Age</span>
            <span style={{ textAlign: "right" }}>Result</span>
            <span />
          </div>
          <div className="log-list">
            {checks.length === 0 && (
              <div className="empty-state">No attempts recorded yet. The first check runs at 07:00 UTC.</div>
            )}
            {checks.map((c, i) => (
              <CheckRow
                key={c.id}
                index={i}
                error={c.error}
                slotCount={c.slot_count}
                slotsFound={c.slots_found ?? []}
                checkedAt={c.checked_at}
              />
            ))}
          </div>
        </div>

        <div className="footer">
          Checks scheduled · 07:00 · 11:00 · 15:00 · 19:00 UTC via GitHub Actions · Email via Resend
        </div>
      </div>
    </>
  );
}
