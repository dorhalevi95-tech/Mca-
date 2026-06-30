import { supabase, type Check, type Notification } from "@/lib/supabase";
import { CheckCircle, XCircle, Clock, Bell, Calendar } from "lucide-react";

const TARGET_DATE = process.env.TARGET_DATE ?? "2025-11-25";

async function getChecks(): Promise<Check[]> {
  const { data } = await supabase
    .from("checks")
    .select("id,checked_at,slot_count,slots_found,error")
    .order("checked_at", { ascending: false })
    .limit(20);
  return (data as Check[]) ?? [];
}

async function getNotifications(): Promise<Notification[]> {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("notified_at", { ascending: false })
    .limit(10);
  return (data as Notification[]) ?? [];
}

export const revalidate = 60; // refresh every 60s

export default async function Home() {
  const [checks, notifications] = await Promise.all([getChecks(), getNotifications()]);
  const latest = checks[0];
  const hasEarlierSlot =
    latest?.slots_found?.some((s) => {
      const d = new Date(s);
      return !isNaN(d.getTime()) && d < new Date(TARGET_DATE);
    }) ?? false;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-800 pb-6">
          <Calendar className="text-blue-400" size={28} />
          <div>
            <h1 className="text-2xl font-bold">MCA Oral Exam Monitor</h1>
            <p className="text-gray-400 text-sm">
              Watching for slots earlier than{" "}
              <span className="text-blue-300 font-mono">{TARGET_DATE}</span> —
              Chief Engineer Unlimited (SVE &lt;500 GT / 3000 kW)
            </p>
          </div>
        </div>

        {/* Status card */}
        <div
          className={`rounded-xl p-6 flex items-center gap-4 ${
            hasEarlierSlot
              ? "bg-green-900/40 border border-green-600"
              : "bg-gray-900 border border-gray-800"
          }`}
        >
          {hasEarlierSlot ? (
            <CheckCircle className="text-green-400 shrink-0" size={36} />
          ) : (
            <Clock className="text-gray-500 shrink-0" size={36} />
          )}
          <div>
            <p className="text-lg font-semibold">
              {hasEarlierSlot
                ? "Earlier slot available — check your email!"
                : "No earlier slots yet"}
            </p>
            <p className="text-gray-400 text-sm">
              Last checked:{" "}
              {latest
                ? new Date(latest.checked_at).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "Never"}
            </p>
          </div>
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-3">
              <Bell size={18} className="text-yellow-400" /> Alerts sent
            </h2>
            <ul className="space-y-2">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className="flex justify-between items-center bg-yellow-900/30 border border-yellow-700/50 rounded-lg px-4 py-3 text-sm"
                >
                  <span className="font-mono text-yellow-200">{n.slot_label}</span>
                  <span className="text-gray-400">
                    {new Date(n.notified_at).toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Check history */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Recent checks</h2>
          <div className="space-y-2">
            {checks.length === 0 && (
              <p className="text-gray-500 text-sm">No checks recorded yet.</p>
            )}
            {checks.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  {c.error ? (
                    <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-gray-200">
                      {c.error ? (
                        <span className="text-red-400">Error: {c.error.slice(0, 80)}</span>
                      ) : c.slot_count > 0 ? (
                        <>
                          <span className="text-green-400 font-semibold">{c.slot_count} slot(s)</span>
                          {" found: "}
                          <span className="font-mono text-blue-300">
                            {c.slots_found.join(", ")}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-500">No slots found</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-gray-500 whitespace-nowrap ml-4">
                  {new Date(c.checked_at).toLocaleString("en-GB", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-center text-gray-600 text-xs pt-4 border-t border-gray-800">
          Checks run automatically at 07:00, 11:00, 15:00 &amp; 19:00 UTC via GitHub Actions.
          Email alerts via Resend when a slot opens.
        </footer>
      </div>
    </main>
  );
}
