import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const MCA_EMAIL = process.env.MCA_EMAIL!;
const MCA_PASSWORD = process.env.MCA_PASSWORD!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL!;
const TARGET_DATE = process.env.TARGET_DATE ?? "2025-11-25"; // earliest known slot

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

async function main() {
  console.log(`[${new Date().toISOString()}] Starting MCA slot check...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // 1. Navigate to the booking page
    await page.goto(
      "https://mymca-prod.powerappsportals.com/book_and_manage_an_oral_exam/",
      { waitUntil: "networkidle", timeout: 60000 }
    );

    // 2. Sign in
    await page.click('a[href*="signin"], button:has-text("Sign in"), a:has-text("Sign in")');
    await page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});

    // Fill email
    const emailInput = page.locator('input[type="email"], input[name="loginfmt"], #i0116');
    await emailInput.fill(MCA_EMAIL);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    // Fill password (Microsoft SSO pattern)
    const passInput = page.locator('input[type="password"], input[name="passwd"], #i0118');
    await passInput.fill(MCA_PASSWORD);
    await page.keyboard.press("Enter");
    await page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});

    // Handle "Stay signed in?" prompt
    const staySignedIn = page.locator('input[value="Yes"], button:has-text("Yes")');
    if (await staySignedIn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await staySignedIn.click();
      await page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    }

    console.log("Logged in, navigating to booking page...");

    // 3. Navigate back to booking if redirected away
    if (!page.url().includes("book_and_manage_an_oral_exam")) {
      await page.goto(
        "https://mymca-prod.powerappsportals.com/book_and_manage_an_oral_exam/",
        { waitUntil: "networkidle", timeout: 60000 }
      );
    }

    // 4. Look for available exam slots
    // The portal shows a calendar or list of available dates
    await page.waitForTimeout(3000);

    const pageContent = await page.content();
    const slots = await extractSlots(page);

    console.log(`Found ${slots.length} available slot(s):`, slots);

    // 5. Store check result in Supabase
    const { error: insertErr } = await supabase.from("checks").insert({
      checked_at: new Date().toISOString(),
      slots_found: slots,
      slot_count: slots.length,
      page_snapshot: pageContent.slice(0, 5000),
    });
    if (insertErr) console.error("Supabase insert error:", insertErr);

    // 6. Check for slots earlier than the target date
    const targetMs = new Date(TARGET_DATE).getTime();
    const earlierSlots = slots.filter((s) => {
      const d = parseSlotDate(s);
      return d !== null && d.getTime() < targetMs;
    });

    if (earlierSlots.length > 0) {
      console.log("EARLIER SLOTS FOUND:", earlierSlots);

      // Check if we already notified about these slots
      const { data: existing } = await supabase
        .from("notifications")
        .select("slot_label")
        .in("slot_label", earlierSlots);

      const alreadyNotified = new Set((existing ?? []).map((r: any) => r.slot_label));
      const newSlots = earlierSlots.filter((s) => !alreadyNotified.has(s));

      if (newSlots.length > 0) {
        await sendNotification(newSlots);

        // Record notification
        await supabase.from("notifications").insert(
          newSlots.map((s) => ({
            slot_label: s,
            notified_at: new Date().toISOString(),
          }))
        );
      }
    } else {
      console.log("No earlier slots found. Next check later today.");
    }
  } catch (err) {
    console.error("Error during check:", err);
    // Log failure to Supabase
    await supabase.from("checks").insert({
      checked_at: new Date().toISOString(),
      slots_found: [],
      slot_count: 0,
      error: String(err),
    });
    throw err;
  } finally {
    await browser.close();
  }
}

async function extractSlots(page: any): Promise<string[]> {
  const slots: string[] = [];

  // Strategy 1: look for date elements in a calendar widget
  const dateEls = await page.locator('[class*="calendar"] [class*="day"]:not([class*="disabled"]):not([class*="past"])').all();
  for (const el of dateEls) {
    const text = await el.textContent().catch(() => "");
    if (text?.trim()) slots.push(text.trim());
  }

  // Strategy 2: look for select/option lists with dates
  if (slots.length === 0) {
    const options = await page.locator('select option, [role="option"]').all();
    for (const opt of options) {
      const text = await opt.textContent().catch(() => "");
      if (text && /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(text)) {
        slots.push(text.trim());
      }
    }
  }

  // Strategy 3: look for time slot buttons
  if (slots.length === 0) {
    const buttons = await page.locator('button:has-text("available"), [class*="slot"]:not([class*="taken"]):not([class*="disabled"])').all();
    for (const btn of buttons) {
      const text = await btn.textContent().catch(() => "");
      if (text?.trim()) slots.push(text.trim());
    }
  }

  // Strategy 4: scrape raw text for date patterns
  if (slots.length === 0) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const datePattern = /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi;
    const matches = bodyText.match(datePattern) ?? [];
    slots.push(...[...new Set(matches)]);
  }

  return [...new Set(slots)];
}

function parseSlotDate(slotLabel: string): Date | null {
  const cleaned = slotLabel.replace(/[^\w\s/-]/g, "").trim();
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

async function sendNotification(slots: string[]) {
  console.log("Sending email notification for slots:", slots);
  await resend.emails.send({
    from: "MCA Monitor <onboarding@resend.dev>",
    to: NOTIFY_EMAIL,
    subject: `MCA Oral Exam: Earlier slot available!`,
    html: `
      <h2>Earlier MCA Oral Exam Slot Found</h2>
      <p>A slot earlier than your current booking (${TARGET_DATE}) has appeared:</p>
      <ul>
        ${slots.map((s) => `<li><strong>${s}</strong></li>`).join("")}
      </ul>
      <p>
        <a href="https://mymca-prod.powerappsportals.com/book_and_manage_an_oral_exam/"
           style="background:#0070f3;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px">
          Book Now
        </a>
      </p>
      <p style="color:#666;font-size:12px">This alert was sent by your MCA slot monitor. Act fast — slots fill up quickly!</p>
    `,
  });
  console.log("Notification sent to", NOTIFY_EMAIL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
