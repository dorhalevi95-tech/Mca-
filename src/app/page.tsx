import { supabase, type Check, type Notification } from "@/lib/supabase";
import { Calendar, Bell, AlertTriangle, TrendingUp, Clock, Activity } from "lucide-react";
import { CheckRow } from "./check-row";

const TARGET_DATE = process.env.TARGET_DATE ?? "2026-11-03";

async function getChecks(): Promise<Check[]> {
  const { data } = await supabase
    .from("checks")
    .select("id,checked_at,slot_count,slots_found,error,page_snapshot")
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
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

  const CSS = `
    :root {
      --bg:      #080F1A;
      --surf:    #0D1B2E;
      --surf2:   #102135;
      --bdr:     #162840;
      --bdr2:    #1E3A5A;
      --txt:     #C8DCF0;
      --muted:   #4E6E8E;
      --accent:  #1CABB8;
      --green:   #2EBF7A;
      --red:     #D94F4F;
      --yellow:  #C8A838;
      --mono: ui-monospace,"Cascadia Code","Fira Code",Consolas,monospace;
      --sans: system-ui,-apple-system,"Segoe UI",sans-serif;
    }
    @media (prefers-color-scheme: light) { :root {
      --bg:#F0F5FA; --surf:#FFF; --surf2:#F5F9FF; --bdr:#D0DDE8; --bdr2:#B0C4D8;
      --txt:#162840; --muted:#6888A4; --accent:#0E8FA0; --green:#1E9B5A; --red:#C03030; --yellow:#9A7A18;
    }}
    :root[data-theme="dark"] {
      --bg:#080F1A; --surf:#0D1B2E; --surf2:#102135; --bdr:#162840; --bdr2:#1E3A5A;
      --txt:#C8DCF0; --muted:#4E6E8E; --accent:#1CABB8; --green:#2EBF7A; --red:#D94F4F; --yellow:#C8A838;
    }
    :root[data-theme="light"] {
      --bg:#F0F5FA; --surf:#FFF; --surf2:#F5F9FF; --bdr:#D0DDE8; --bdr2:#B0C4D8;
      --txt:#162840; --muted:#6888A4; --accent:#0E8FA0; --green:#1E9B5A; --red:#C03030; --yellow:#9A7A18;
    }

    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--txt);font-family:var(--sans);font-size:14px;line-height:1.5}
    .shell{max-width:960px;margin:0 auto;padding:24px 16px 64px}

    /* Header */
    .hdr{display:flex;align-items:flex-start;gap:14px;padding-bottom:20px;border-bottom:1px solid var(--bdr);margin-bottom:24px}
    .hdr-icon{color:var(--accent);flex-shrink:0;margin-top:2px}
    .hdr-title{font-size:19px;font-weight:700;letter-spacing:-0.02em}
    .hdr-sub{font-size:12px;color:var(--muted);margin-top:2px;font-family:var(--mono)}
    .hdr-target{color:var(--accent)}
    .hdr-badge{margin-left:auto;font-size:11px;font-weight:600;padding:5px 10px;border-radius:4px;white-space:nowrap;display:flex;align-items:center;gap:5px}
    .badge-ok{background:rgba(46,191,122,.12);border:1px solid rgba(46,191,122,.35);color:var(--green)}
    .badge-warn{background:rgba(217,79,79,.12);border:1px solid rgba(217,79,79,.35);color:var(--red)}

    /* Stats */
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--bdr);border:1px solid var(--bdr);border-radius:8px;overflow:hidden;margin-bottom:24px}
    .stat{background:var(--surf);padding:14px 18px}
    .stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:5px;display:flex;align-items:center;gap:4px}
    .stat-val{font-family:var(--mono);font-size:24px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
    .stat-sub{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:3px}
    .v-green{color:var(--green)} .v-red{color:var(--red)} .v-acc{color:var(--accent)} .v-yel{color:var(--yellow)}

    /* Streak */
    .streak{display:flex;align-items:center;gap:8px;background:rgba(217,79,79,.08);border:1px solid rgba(217,79,79,.3);border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:13px;color:var(--red)}

    /* Notifications */
    .sec-title{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:5px}
    .notif-list{display:flex;flex-direction:column;gap:5px;margin-bottom:24px}
    .notif-row{display:flex;justify-content:space-between;align-items:center;background:rgba(200,168,56,.08);border:1px solid rgba(200,168,56,.25);border-radius:5px;padding:7px 12px}
    .notif-slot{font-family:var(--mono);font-size:13px;color:var(--yellow);font-weight:600}
    .notif-time{font-family:var(--mono);font-size:11px;color:var(--muted)}

    /* Check rows */
    .cr{border-radius:6px;border:1px solid var(--bdr);background:var(--surf);overflow:hidden;margin-bottom:3px}
    .cr-fail{border-color:rgba(217,79,79,.3);background:rgba(217,79,79,.03)}
    .cr-slot{border-color:rgba(200,168,56,.4);background:rgba(200,168,56,.04)}
    .cr-main{display:grid;grid-template-columns:8px 46px 130px 46px 1fr 62px 20px;gap:0 10px;align-items:center;padding:9px 12px;cursor:pointer}
    .cr-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .cd-ok  {background:var(--green);box-shadow:0 0 5px var(--green)}
    .cd-fail{background:var(--red);  box-shadow:0 0 5px var(--red)}
    .cd-slot{background:var(--yellow);box-shadow:0 0 5px var(--yellow)}
    .cr-seq{font-family:var(--mono);font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
    .cr-time{display:flex;flex-direction:column;gap:1px}
    .cr-date{font-family:var(--mono);font-size:12px;color:var(--txt);font-variant-numeric:tabular-nums}
    .cr-clock{font-family:var(--mono);font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
    .cr-status{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.05em;text-align:center;padding:2px 6px;border-radius:3px}
    .cs-ok  {background:rgba(46,191,122,.12);color:var(--green)}
    .cs-fail{background:rgba(217,79,79,.12);color:var(--red)}
    .cr-result{font-size:13px;min-width:0}
    .cr-err-short{color:var(--red);font-size:12px}
    .cr-slots-found{color:var(--yellow);font-weight:600}
    .cr-no-slots{color:var(--muted);font-size:12px}
    .cr-age{font-family:var(--mono);font-size:11px;color:var(--muted);text-align:right}
    .cr-toggle{background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;justify-content:flex-end;padding:0}
    .cr-toggle:hover{color:var(--txt)}
    .cr-toggle:focus-visible{outline:2px solid var(--accent);border-radius:2px}

    /* Detail panel */
    .cr-detail{border-top:1px solid var(--bdr);padding:12px 12px 14px;background:var(--surf2)}
    .cr-detail-label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:8px}
    .cr-error-pre{font-family:var(--mono);font-size:11px;color:var(--red);white-space:pre-wrap;word-break:break-all;background:rgba(217,79,79,.06);border:1px solid rgba(217,79,79,.15);border-radius:4px;padding:8px 10px;max-height:200px;overflow-y:auto}
    .cr-no-data{font-size:12px;color:var(--muted);font-style:italic}

    /* Week list */
    .cr-week-list{display:flex;flex-direction:column;gap:3px}
    .cr-week{display:flex;align-items:flex-start;gap:12px;padding:7px 10px;border-radius:4px;border:1px solid var(--bdr)}
    .cw-found{border-color:rgba(200,168,56,.3);background:rgba(200,168,56,.05)}
    .cw-empty{background:var(--surf)}
    .cw-left{display:flex;align-items:center;gap:5px;flex-shrink:0;width:200px}
    .cw-icon{color:var(--muted);flex-shrink:0}
    .cw-range{font-family:var(--mono);font-size:11px;color:var(--txt);font-variant-numeric:tabular-nums}
    .cw-right{flex:1;min-width:0}
    .cw-none{font-size:11px;color:var(--muted)}
    .cw-slots{display:flex;flex-wrap:wrap;gap:5px}
    .cw-slot-chip{font-family:var(--mono);font-size:11px;background:rgba(200,168,56,.15);border:1px solid rgba(200,168,56,.35);border-radius:3px;padding:1px 7px;color:var(--yellow)}

    .log-header{display:grid;grid-template-columns:8px 46px 130px 46px 1fr 62px 20px;gap:0 10px;padding:5px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);border-bottom:1px solid var(--bdr);margin-bottom:6px}
    .empty{text-align:center;padding:48px 0;color:var(--muted);font-size:13px}
    .footer{margin-top:32px;padding-top:14px;border-top:1px solid var(--bdr);text-align:center;font-size:11px;color:var(--muted);font-family:var(--mono)}

    @media(max-width:640px){
      .stats{grid-template-columns:repeat(2,1fr)}
      .log-header{display:none}
      .cr-main{grid-template-columns:8px 1fr auto 20px}
      .cr-seq,.cr-status,.cr-age{display:none}
      .cw-left{width:140px}
    }
    @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
  `;

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">

        {/* Header */}
        <div className="hdr">
          <Calendar className="hdr-icon" size={22} />
          <div>
            <div className="hdr-title">MCA Oral Exam — Slot Monitor</div>
            <div className="hdr-sub">
              Watching for cancellations before{" "}
              <span className="hdr-target">{TARGET_DATE}</span>
              {" "}· Chief Engineer (SVE &lt;500 GT / 3000 kW)
            </div>
          </div>
          {hasEarlierSlot ? (
            <div className="hdr-badge badge-ok"><Activity size={12} /> Earlier slot found</div>
          ) : streak >= 3 ? (
            <div className="hdr-badge badge-warn"><AlertTriangle size={12} /> {streak} failures in a row</div>
          ) : null}
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat">
            <div className="stat-lbl"><TrendingUp size={10} /> Total checks</div>
            <div className="stat-val v-acc">{total}</div>
            <div className="stat-sub">{succeeded} ok · {failed} failed</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Login success</div>
            <div className={`stat-val ${successRate >= 75 ? "v-green" : successRate >= 40 ? "v-yel" : "v-red"}`}>
              {successRate}<span style={{ fontSize: 13 }}>%</span>
            </div>
            <div className="stat-sub">portal logins completed</div>
          </div>
          <div className="stat">
            <div className="stat-lbl"><Clock size={10} /> Last check</div>
            <div className="stat-val" style={{ fontSize: 13, lineHeight: 1.4 }}>
              {latest ? fmtTime(latest.checked_at) : "—"}
            </div>
            <div className={`stat-sub ${latest?.error ? "v-red" : "v-green"}`}>
              {latest?.error ? "failed" : "succeeded"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Last success</div>
            <div className="stat-val" style={{ fontSize: 13, lineHeight: 1.4 }}>
              {lastSuccess ? fmtTime(lastSuccess.checked_at) : "—"}
            </div>
            <div className="stat-sub" style={{ color: streak > 0 ? "var(--red)" : "var(--muted)" }}>
              {streak > 0 ? `${streak} fail streak` : "running fine"}
            </div>
          </div>
        </div>

        {/* Streak warning */}
        {streak >= 3 && (
          <div className="streak">
            <AlertTriangle size={15} />
            <span>
              <strong>{streak} consecutive login failures.</strong>{" "}
              The MCA portal may be unavailable or the login flow has changed.
              Expand a recent row to see the error.
            </span>
          </div>
        )}

        {/* Notifications */}
        {notifications.length > 0 && (
          <>
            <div className="sec-title"><Bell size={10} /> Email alerts sent ({notifications.length})</div>
            <div className="notif-list">
              {notifications.map((n) => (
                <div key={n.id} className="notif-row">
                  <span className="notif-slot">{n.slot_label}</span>
                  <span className="notif-time">{fmtTime(n.notified_at)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Log */}
        <div className="sec-title"><Activity size={10} /> Check log — {total} attempt{total !== 1 ? "s" : ""} · click any row to expand</div>
        <div className="log-header">
          <span /><span>#</span><span>Date / Time</span><span>Status</span>
          <span>Result</span><span style={{ textAlign: "right" }}>Age</span><span />
        </div>

        {checks.length === 0 && (
          <div className="empty">No checks yet. First run at 07:00 UTC.</div>
        )}

        {checks.map((c, i) => (
          <CheckRow
            key={c.id}
            index={i}
            error={c.error}
            slotCount={c.slot_count}
            slotsFound={c.slots_found ?? []}
            checkedAt={c.checked_at}
            pageSnapshot={c.page_snapshot}
          />
        ))}

        <div className="footer">
          Checks run at 07:00 · 11:00 · 15:00 · 19:00 UTC via GitHub Actions
        </div>
      </div>
    </>
  );
}
