import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const MCA_SDS_NUMBER = process.env.MCA_SDS_NUMBER!;
const MCA_DOB = process.env.MCA_DOB!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL!;
const TARGET_DATE = process.env.TARGET_DATE ?? "2026-11-25";

const SDS_URL = "https://mymca-prod.powerappsportals.com/enter-your-seafarer-reference-number/";
const LANDING_URL = "https://mymca-prod.powerappsportals.com/book_and_manage_an_oral_exam/";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

async function acceptCookies(page: any) {
  const cookieSelectors = [
    "#cookies-accept",
    'button:has-text("Accept all")',
    'button:has-text("Accept cookies")',
    'button:has-text("Accept")',
  ];
  for (const sel of cookieSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 60000 }).catch(() => false)) {
      console.log(`Accepting cookies via: ${sel}`);
      await btn.click();
      await page.waitForTimeout(2000);
      return true;
    }
  }
  return false;
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting MCA slot check...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  });
  const page = await context.newPage();
  // No global timeout — the MCA portal is slow and we never want to give up waiting
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(0);

  try {
    // Step 1: Visit landing page to set cookies, then accept cookie consent
    console.log("Loading landing page...");
    await page.goto(LANDING_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(3000);
    await acceptCookies(page);
    await page.waitForTimeout(2000);
    console.log("Landing page done. URL:", page.url());
    await page.screenshot({ path: `screenshot-landing-${Date.now()}.png`, fullPage: true });

    // Step 2: Navigate directly to SDS entry page (skip clicking "Start now")
    console.log("Navigating directly to SDS entry page...");
    await page.goto(SDS_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(3000);
    // Accept cookies again if they re-appear after navigation
    await acceptCookies(page);
    await page.waitForTimeout(2000);
    console.log("SDS page URL:", page.url());
    await page.screenshot({ path: `screenshot-sds-page-${Date.now()}.png`, fullPage: true });

    // If we were redirected away, try the landing page flow as fallback
    if (!page.url().includes("enter-your-seafarer-reference-number")) {
      console.log("Redirected away from SDS page. Trying landing page CTA click...");
      await page.goto(LANDING_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForTimeout(5000);
      await acceptCookies(page);
      await page.waitForTimeout(3000);

      const ctaSelectors = [
        'a:has-text("Start")',
        'a:has-text("Book")',
        'button:has-text("Start")',
        'button:has-text("Book")',
        'a[href*="enter-your-seafarer"]',
      ];
      for (const sel of ctaSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 60000 }).catch(() => false)) {
          console.log(`Clicking CTA: ${sel}`);
          await el.click();
          break;
        }
      }
      // Wait generously for navigation
      await page.waitForURL("**/enter-your-seafarer-reference-number/**", { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log("After CTA fallback — URL:", page.url());
      await page.screenshot({ path: `screenshot-after-cta-${Date.now()}.png`, fullPage: true });
    }

    // Step 3: Fill SDS number
    console.log("Looking for SDS input...");
    const sdsSelectors = [
      'input[name*="sds" i]',
      'input[id*="sds" i]',
      'input[placeholder*="SDS" i]',
      'input[placeholder*="seafarer" i]',
      'input[placeholder*="reference" i]',
      'input[aria-label*="sds" i]',
      'input[aria-label*="seafarer" i]',
    ];

    // Log all inputs on page for debugging
    const allInputs = await page.locator("input:not([type='hidden'])").all();
    console.log(`Found ${allInputs.length} inputs on SDS page:`);
    for (const el of allInputs) {
      const name = await el.getAttribute("name").catch(() => "");
      const id = await el.getAttribute("id").catch(() => "");
      const placeholder = await el.getAttribute("placeholder").catch(() => "");
      console.log(`  INPUT name="${name}" id="${id}" placeholder="${placeholder}"`);
    }

    let sdsFilled = false;
    for (const sel of sdsSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 60000 }).catch(() => false)) {
        await el.fill(MCA_SDS_NUMBER);
        console.log(`Filled SDS using: ${sel}`);
        sdsFilled = true;
        break;
      }
    }

    if (!sdsFilled) {
      // Fallback: use first visible text input (wait up to 30s for it to appear)
      const firstInput = page
        .locator("input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='submit'])")
        .first();
      console.log("Waiting for any visible input (up to 30s)...");
      await firstInput.waitFor({ timeout: 120000 });
      await firstInput.fill(MCA_SDS_NUMBER);
      console.log("Filled SDS using first available input");
    }

    await page.screenshot({ path: `screenshot-sds-filled-${Date.now()}.png`, fullPage: true });

    // Submit SDS form
    const submitSelectors = [
      'button:has-text("Continue")',
      'button:has-text("Submit")',
      'button[type="submit"]',
      'input[type="submit"]',
    ];
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 60000 }).catch(() => false)) {
        await btn.click();
        console.log(`Clicked submit via: ${sel}`);
        break;
      }
    }

    await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log("After SDS submit — URL:", page.url());
    await page.screenshot({ path: `screenshot-after-sds-${Date.now()}.png`, fullPage: true });

    // Step 4: DOB page — portal has 3 separate Day/Month/Year fields
    if (page.url().includes("date_of_birth") || page.url().includes("dob")) {
      console.log("On DOB page — filling date of birth...");

      const dobParts = MCA_DOB.split(/[\/\-\.\s]+/);
      const dobDay   = dobParts[0] ?? "";
      const dobMonth = dobParts[1] ?? "";
      const dobYear  = dobParts[2] ?? "";
      console.log(`Parsed DOB — Day: "${dobDay}" Month: "${dobMonth}" Year: "${dobYear}"`);

      // Fill via native React/framework-compatible events
      async function fillNative(selector: string, value: string) {
        await page.locator(selector).first().click();
        await page.waitForTimeout(150);
        await page.evaluate(({ sel, val }: { sel: string; val: string }) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (!el) return;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(el, val); else el.value = val;
          el.dispatchEvent(new Event("focus",  { bubbles: true }));
          el.dispatchEvent(new Event("input",  { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        }, { sel: selector, val: value });
        await page.waitForTimeout(300);
      }

      // Retry DOB submit up to 3 times — portal backend sometimes transiently rejects
      let dobAccepted = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`DOB attempt ${attempt}/3`);

        // Wait for page to settle before filling
        await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(1500);

        await fillNative("#dob-day",   dobDay);
        await fillNative("#dob-month", dobMonth);
        await fillNative("#dob-year",  dobYear);
        await page.keyboard.press("Tab"); // blur last field
        await page.waitForTimeout(500);

        const dayVal = await page.locator("#dob-day").inputValue().catch(() => "?");
        const monVal = await page.locator("#dob-month").inputValue().catch(() => "?");
        const yrVal  = await page.locator("#dob-year").inputValue().catch(() => "?");
        console.log(`Field values — Day: "${dayVal}" Month: "${monVal}" Year: "${yrVal}"`);
        await page.screenshot({ path: `screenshot-dob-attempt${attempt}-${Date.now()}.png`, fullPage: true });

        for (const sel of submitSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 30000 }).catch(() => false)) {
            await btn.click();
            console.log(`Clicked DOB submit via: ${sel}`);
            break;
          }
        }

        await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
        await page.waitForTimeout(3000);
        const afterDobUrl = page.url();
        console.log(`Attempt ${attempt} — After DOB submit URL: ${afterDobUrl}`);

        if (!afterDobUrl.includes("date_of_birth") && !afterDobUrl.includes("dob")) {
          dobAccepted = true;
          break;
        }

        if (attempt < 3) {
          console.log(`DOB rejected on attempt ${attempt} — waiting 10s before retry...`);
          await page.waitForTimeout(10000);
        }
      }

      if (!dobAccepted) {
        const bodyText = await page.locator("body").innerText().catch(() => "");
        console.log("DOB page body after all retries:", bodyText.slice(0, 800));
        throw new Error(`DOB rejected after 3 attempts — check MCA_DOB secret (format DD/MM/YYYY)`);
      }
    }

    // Step 5: Navigate through the portal to reach the booking calendar
    // Flow: Dashboard → click "Exams" → click exam link → click "Change time or date"
    // IMPORTANT: never click "Cancel exam booking"
    console.log("Post-login URL:", page.url());
    await page.screenshot({ path: `screenshot-dashboard-${Date.now()}.png`, fullPage: true });

    async function clickVisible(selectors: string[], label: string): Promise<boolean> {
      for (const sel of selectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 15000 }).catch(() => false)) {
          console.log(`Clicking ${label} via: ${sel}`);
          await el.click();
          await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
          await page.waitForTimeout(2000);
          console.log(`After ${label} click — URL: ${page.url()}`);
          return true;
        }
      }
      console.log(`Could not find ${label}`);
      return false;
    }

    // Step 5a: Click "Exams" card on dashboard
    await clickVisible([
      'a:has-text("Exams")',
      '.card:has-text("Exams")',
      'a[href*="exam"]',
      'text=Book or manage exams',
    ], "Exams card");
    await page.screenshot({ path: `screenshot-exams-${Date.now()}.png`, fullPage: true });

    // Step 5b: Click the exam type link (e.g. "Small Vessel - Chief Engineer...")
    await clickVisible([
      'a:has-text("Chief Engineer")',
      'a:has-text("Small Vessel")',
      'a:has-text("Oral exam")',
      '.govuk-table__row a',
      'table a',
    ], "exam type link");
    await page.screenshot({ path: `screenshot-manage-${Date.now()}.png`, fullPage: true });

    // Step 5c: Click "Change time or date" — NEVER "Cancel exam booking"
    const changedToCalendar = await clickVisible([
      'a:has-text("Change time or date")',
      'button:has-text("Change time or date")',
    ], "Change time or date");

    if (!changedToCalendar) {
      const bodySnap = await page.locator("body").innerText().catch(() => "");
      console.log("Page content after exam link click:", bodySnap.slice(0, 1500));
    }
    await page.screenshot({ path: `screenshot-calendar-${Date.now()}.png`, fullPage: true });
    console.log("Calendar page URL:", page.url());

    // Log all buttons to help debug week navigation
    const allBtns = await page.locator("button").all();
    console.log(`Buttons on page (${allBtns.length}):`);
    for (const btn of allBtns.slice(0, 30)) {
      const txt = await btn.innerText().catch(() => "");
      console.log(`  BUTTON: "${txt.trim()}"`);
    }

    // Step 6: Walk through every week up to TARGET_DATE and collect all slots
    const { slots, weeks } = await extractAllWeeks(page, TARGET_DATE);
    console.log(`Found ${slots.length} available slot(s) across ${weeks.length} weeks:`, slots);

    const { error: insertErr } = await supabase.from("checks").insert({
      checked_at: new Date().toISOString(),
      slots_found: slots,
      slot_count: slots.length,
      // Store per-week breakdown as JSON in page_snapshot
      page_snapshot: JSON.stringify(weeks),
    });
    if (insertErr) console.error("Supabase insert error:", insertErr);

    const targetMs = new Date(TARGET_DATE).getTime();
    const earlierSlots = slots.filter((s) => {
      const d = parseSlotDate(s);
      return d !== null && d.getTime() < targetMs;
    });

    if (earlierSlots.length > 0) {
      console.log("EARLIER SLOTS FOUND:", earlierSlots);

      const { data: existing } = await supabase
        .from("notifications")
        .select("slot_label")
        .in("slot_label", earlierSlots);

      const alreadyNotified = new Set((existing ?? []).map((r: any) => r.slot_label));
      const newSlots = earlierSlots.filter((s) => !alreadyNotified.has(s));

      if (newSlots.length > 0) {
        await sendNotification(newSlots);
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
    await page
      .screenshot({ path: `screenshot-failure-${Date.now()}.png`, fullPage: true })
      .catch(() => {});
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

type WeekResult = {
  weekNum: number;       // 1-based week index
  dateRange: string;     // e.g. "3 Jul – 9 Jul 2025"
  slots: string[];       // available slot dates found this week
};

// Walk through every week on the calendar, clicking "next week" until we reach
// or pass targetDate. Returns all unique slots AND a per-week breakdown.
async function extractAllWeeks(
  page: any,
  targetDate: string
): Promise<{ slots: string[]; weeks: WeekResult[] }> {
  const targetMs = new Date(targetDate).getTime();
  const weeks: WeekResult[] = [];
  const MAX_WEEKS = 25; // safety cap — Nov 2026 is ~24 weeks from Jul 2026

  const nextBtnSelectors = [
    'button:has-text("Next week")',
    'button:has-text("Next Week")',
    'button[aria-label*="next" i]',
    'a:has-text("Next week")',
    'a:has-text("Next")',
    '[class*="next"]:not([disabled])',
    'button:has-text("›")',
    'button:has-text(">")',
  ];

  for (let w = 0; w < MAX_WEEKS; w++) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const visibleDates = extractDatesFromText(bodyText);
    const weekSlots = extractAvailableSlots(bodyText);

    // Build a human-readable date range label from the visible dates
    const sorted = visibleDates
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const dateRange =
      sorted.length >= 2
        ? `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}`
        : sorted.length === 1
        ? fmt(sorted[0])
        : "unknown week";

    const result: WeekResult = { weekNum: w + 1, dateRange, slots: weekSlots };
    weeks.push(result);
    console.log(`Week ${w + 1} [${dateRange}]: ${weekSlots.length} slot(s) — [${weekSlots.join(", ")}]`);

    // Stop once the latest visible date has reached or passed target
    const latestVisible = sorted.length ? sorted[sorted.length - 1].getTime() : 0;
    if (latestVisible >= targetMs) {
      console.log(`Reached/passed target date ${targetDate} — done.`);
      break;
    }

    // Click "next week"
    let clicked = false;
    for (const sel of nextBtnSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 30000 }).catch(() => false)) {
        await btn.click();
        clicked = true;
        console.log(`Clicked next week via: ${sel}`);
        break;
      }
    }

    if (!clicked) {
      console.log("No 'next week' button found — stopping.");
      break;
    }

    // Short networkidle wait (15s max) then fixed pause — keeps total scan time under 10 min
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  const allSlots = [...new Set(weeks.flatMap((w) => w.slots))];
  console.log(`Total unique slots across all weeks: ${allSlots.length}`);
  return { slots: allSlots, weeks };
}

function extractDatesFromText(text: string): string[] {
  const pattern =
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/gi;
  return [...new Set((text.match(pattern) ?? []).map((s) => s.trim()))];
}

function extractAvailableSlots(bodyText: string): string[] {
  // Look for dates that appear near availability keywords
  // A "slot" is a date near words like "available", "select", "choose", "book", or a time
  const lines = bodyText.split("\n");
  const slotLines: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasDate = /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(line);
    const hasTime = /\b\d{1,2}:\d{2}\b/.test(line);
    const hasAvailKeyword = /\b(available|select|choose|book|am|pm|slot)\b/i.test(lower);
    if (hasDate && (hasTime || hasAvailKeyword)) {
      slotLines.push(line.trim());
    }
  }
  // Fall back: if nothing keyword-matched, return dates that also have a time component
  if (slotLines.length === 0) {
    return extractDatesFromText(bodyText).filter(d => /\d{1,2}:\d{2}/.test(d));
  }
  return [...new Set(slotLines)];
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
