import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const MCA_SDS_NUMBER = process.env.MCA_SDS_NUMBER!;
const MCA_DOB = process.env.MCA_DOB!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL!;
const TARGET_DATE = process.env.TARGET_DATE ?? "2026-11-03";

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
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`Accepting cookies via: ${sel}`);
      await btn.click();
      await page.waitForTimeout(1000);
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
  // 30s default for element waits, 45s for navigation — fast-fail on hangs
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(45000);

  try {
    // Step 1: Visit landing page to set cookies, then accept cookie consent
    console.log("Loading landing page...");
    await page.goto(LANDING_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await acceptCookies(page);
    console.log("Landing page done. URL:", page.url());
    await page.screenshot({ path: `screenshot-landing-${Date.now()}.png`, fullPage: true });

    // Step 2: Navigate directly to SDS entry page (skip clicking "Start now")
    console.log("Navigating directly to SDS entry page...");
    await page.goto(SDS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await acceptCookies(page);
    console.log("SDS page URL:", page.url());
    await page.screenshot({ path: `screenshot-sds-page-${Date.now()}.png`, fullPage: true });

    // If we were redirected away, try the landing page flow as fallback
    if (!page.url().includes("enter-your-seafarer-reference-number")) {
      console.log("Redirected away from SDS page. Trying landing page CTA click...");
      await page.goto(LANDING_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await acceptCookies(page);

      const ctaSelectors = [
        'a:has-text("Start")',
        'a:has-text("Book")',
        'button:has-text("Start")',
        'button:has-text("Book")',
        'a[href*="enter-your-seafarer"]',
      ];
      for (const sel of ctaSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 8000 }).catch(() => false)) {
          console.log(`Clicking CTA: ${sel}`);
          await el.click();
          break;
        }
      }
      await page.waitForURL("**/enter-your-seafarer-reference-number/**", { timeout: 15000 }).catch(() => {});
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
      if (await el.isVisible({ timeout: 8000 }).catch(() => false)) {
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
      await firstInput.waitFor({ timeout: 15000 });
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
      if (await btn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await btn.click();
        console.log(`Clicked submit via: ${sel}`);
        break;
      }
    }

    await page.waitForTimeout(4000);
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

      // Log actual input IDs on the DOB page for debugging
      const dobInputs = await page.locator("input:not([type='hidden'])").all();
      console.log(`DOB page inputs (${dobInputs.length}):`);
      for (const el of dobInputs) {
        const id   = await el.getAttribute("id").catch(() => "");
        const name = await el.getAttribute("name").catch(() => "");
        const type = await el.getAttribute("type").catch(() => "");
        console.log(`  INPUT id="${id}" name="${name}" type="${type}"`);
      }

      // Fill a field by clicking into it, clearing it, then typing character-by-character.
      // This is the most realistic browser-like input and works best with PowerApps portals.
      async function typeIntoField(selector: string, value: string) {
        const el = page.locator(selector).first();
        await el.waitFor({ timeout: 15000 });
        await el.click();
        await page.waitForTimeout(200);
        // Clear any existing value
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(100);
        // Type each character with a realistic delay
        await el.pressSequentially(value, { delay: 120 });
        await page.waitForTimeout(300);
      }

      // Try both the known IDs and fallback positional selectors
      const daySelectors   = ["#dob-day",   "input[name*='day' i]",   "input[autocomplete*='bday-day']",   "input:nth-of-type(1)"];
      const monthSelectors = ["#dob-month", "input[name*='month' i]", "input[autocomplete*='bday-month']", "input:nth-of-type(2)"];
      const yearSelectors  = ["#dob-year",  "input[name*='year' i]",  "input[autocomplete*='bday-year']",  "input:nth-of-type(3)"];

      async function findAndFill(selectors: string[], value: string, label: string) {
        for (const sel of selectors) {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
            await typeIntoField(sel, value);
            const filled = await el.inputValue().catch(() => "?");
            console.log(`Filled ${label} via "${sel}" — value: "${filled}"`);
            return sel;
          }
        }
        console.log(`WARNING: could not find ${label} input`);
        return null;
      }

      // Retry DOB submit up to 3 times — portal backend sometimes transiently rejects
      let dobAccepted = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`DOB attempt ${attempt}/3`);

        // Wait for the day field to be visible (not networkidle — avoids session/CSRF expiry)
        await page.locator("#dob-day, input[name*='day' i]").first()
          .waitFor({ timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(500);

        await findAndFill(daySelectors,   dobDay,   "day");
        await page.keyboard.press("Tab");
        await page.waitForTimeout(150);
        await findAndFill(monthSelectors, dobMonth, "month");
        await page.keyboard.press("Tab");
        await page.waitForTimeout(150);
        await findAndFill(yearSelectors,  dobYear,  "year");
        await page.keyboard.press("Tab");
        await page.waitForTimeout(500);

        await page.screenshot({ path: `screenshot-dob-attempt${attempt}-${Date.now()}.png`, fullPage: true });

        for (const sel of submitSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 15000 }).catch(() => false)) {
            await btn.click();
            console.log(`Clicked DOB submit via: ${sel}`);
            break;
          }
        }

        // Wait for navigation — use URL change rather than networkidle
        await page.waitForURL((url) => !url.toString().includes("date_of_birth") && !url.toString().includes("/dob"), { timeout: 30000 })
          .catch(() => {});
        await page.waitForTimeout(2000);
        const afterDobUrl = page.url();
        console.log(`Attempt ${attempt} — After DOB submit URL: ${afterDobUrl}`);

        if (!afterDobUrl.includes("date_of_birth") && !afterDobUrl.includes("dob")) {
          dobAccepted = true;
          break;
        }

        // Check for error message
        const errText = await page.locator(".govuk-error-summary, .error, [class*='error']").first().innerText().catch(() => "");
        console.log(`DOB error on page: "${errText.slice(0, 200)}"`);

        if (attempt < 3) {
          console.log(`DOB rejected on attempt ${attempt} — waiting 5s before retry...`);
          await page.waitForTimeout(5000);
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
          await page.waitForTimeout(4000);
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

    // Step 6: On /enter_exam_date/ — read current booking, click "Show earliest available date"
    const bodyBeforeClick = await page.locator("body").innerText().catch(() => "");

    // Extract current booking date from "You are changing your current exam slot of HH:MM (GMT), DD Month YYYY"
    const currentSlotMatch = bodyBeforeClick.match(
      /changing your current exam slot of ([^\n]+)/i
    );
    const currentSlotLabel = currentSlotMatch ? currentSlotMatch[1].trim() : null;
    console.log("Current booking slot:", currentSlotLabel);

    // Use current booking date as comparison target (more accurate than TARGET_DATE secret)
    const currentBookingDate = currentSlotLabel ? parseSlotDate(currentSlotLabel) : new Date(TARGET_DATE);
    const targetMs = currentBookingDate ? currentBookingDate.getTime() : new Date(TARGET_DATE).getTime();
    console.log("Comparing against:", currentBookingDate?.toISOString() ?? TARGET_DATE);

    // Click "Show earliest available date" to get the earliest slot
    console.log('Clicking "Show earliest available date"...');
    const showEarliestBtn = page.locator('button:has-text("Show earliest available date"), a:has-text("Show earliest available date")').first();
    if (await showEarliestBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await showEarliestBtn.click();
      await page.waitForTimeout(3000);
      await page.waitForTimeout(4000);
    } else {
      console.log("Show earliest button not found — reading page as-is");
    }
    await page.screenshot({ path: `screenshot-earliest-${Date.now()}.png`, fullPage: true });

    const bodyAfterClick = await page.locator("body").innerText().catch(() => "");
    console.log("Page after earliest click (first 1500 chars):\n", bodyAfterClick.slice(0, 1500));

    const { slots, weeks } = await extractSlotsFromPage(page, TARGET_DATE, bodyAfterClick);
    console.log(`Found ${slots.length} available slot(s):`, slots);

    const { error: insertErr } = await supabase.from("checks").insert({
      checked_at: new Date().toISOString(),
      slots_found: slots,
      slot_count: slots.length,
      page_snapshot: JSON.stringify(weeks),
    });
    if (insertErr) console.error("Supabase insert error:", insertErr);

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
  weekNum: number;
  dateRange: string;
  slots: string[];
};

// Read slot information from the /enter_exam_date/ page after clicking "Show earliest available date".
async function extractSlotsFromPage(
  page: any,
  targetDate: string,
  bodyText?: string
): Promise<{ slots: string[]; weeks: WeekResult[] }> {
  if (!bodyText) {
    bodyText = await page.locator("body").innerText().catch(() => "");
  }

  // Try to parse the week view format the portal shows:
  //   Monday\n7 December\nNo slots\nTuesday\n8 December\n1 slots\n...\nAvailable slots\n09:00\n11:30
  const weekViewSlots = extractWeekViewSlots(bodyText);
  if (weekViewSlots.slots.length > 0 || weekViewSlots.hadWeekView) {
    console.log("Parsed week view slots:", weekViewSlots.slots);
    const week: WeekResult = { weekNum: 1, dateRange: weekViewSlots.dateRange, slots: weekViewSlots.slots };
    return { slots: weekViewSlots.slots, weeks: [week] };
  }

  // Look for portal date labels after clicking "Show earliest available date"
  const firstSlotMatch = bodyText.match(
    /(?:first|earliest)\s+available\s+(?:slot|date)[:\s]+([^\n]{3,80})/i
  ) ?? bodyText.match(
    /(?:the\s+)?earliest\s+(?:slot|date)\s+(?:is|available)[:\s]+([^\n]{3,80})/i
  );
  if (firstSlotMatch) {
    const slotLabel = firstSlotMatch[1]?.trim() ?? firstSlotMatch[0].trim();
    console.log("Earliest slot from portal label:", slotLabel);
    const week: WeekResult = { weekNum: 1, dateRange: slotLabel, slots: [slotLabel] };
    return { slots: [slotLabel], weeks: [week] };
  }

  // Check if a date was populated into the date input field after clicking "Show earliest"
  const dateInputVal = await page.locator('input[type="text"], input[type="date"]').first().inputValue().catch(() => "");
  if (dateInputVal && /\d/.test(dateInputVal)) {
    console.log("Date input value after Show earliest:", dateInputVal);
    const week: WeekResult = { weekNum: 1, dateRange: dateInputVal, slots: [dateInputVal] };
    return { slots: [dateInputVal], weeks: [week] };
  }

  // Fallback: extract any date lines that look like bookable slots
  const slots = extractAvailableSlots(bodyText);
  console.log("Fallback extracted slots:", slots);

  const allDates = extractDatesFromText(bodyText);
  const sorted = allDates
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
      : "page scanned";

  const week: WeekResult = { weekNum: 1, dateRange, slots };
  return { slots, weeks: [week] };
}

// Parse the Mon-Fri week-view table the portal renders:
//   Monday\n7 December\nNo slots\nTuesday\n8 December\n1 slots\n...\nAvailable slots\n09:00\n11:30
// We infer the year from the TARGET_DATE env var (or current year + 1 if missing).
function extractWeekViewSlots(bodyText: string): { slots: string[]; dateRange: string; hadWeekView: boolean } {
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const lines = bodyText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Detect whether this looks like a week view at all
  const hasDayLine = lines.some((l) => DAY_NAMES.includes(l));
  const hasSlotCountLine = lines.some((l) => /^\d+\s+slots?$/i.test(l) || /^no\s+slots?$/i.test(l));
  if (!hasDayLine || !hasSlotCountLine) {
    return { slots: [], dateRange: "page scanned", hadWeekView: false };
  }

  // Infer year from current date: if the parsed date would fall in the past, bump by 1 year.
  // This handles the common case where the portal omits the year from date lines.
  const now = new Date();

  // Collect (date, slotCount) pairs
  type DayEntry = { label: string; date: Date; count: number };
  const entries: DayEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!DAY_NAMES.includes(lines[i])) continue;

    // Next non-empty line should be "D Month" (with or without year)
    const dateLine = lines[i + 1] ?? "";
    const dateMatch = dateLine.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?$/);
    if (!dateMatch) continue;

    const day = parseInt(dateMatch[1], 10);
    const monthStr = dateMatch[2];
    const monthIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(monthStr.toLowerCase().slice(0, 3)));
    if (monthIdx === -1) continue;
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : now.getFullYear();
    // If the date without an explicit year falls in the past, it must be next year
    if (!dateMatch[3] && new Date(year, monthIdx, day) < now) year += 1;
    const date = new Date(year, monthIdx, day);
    if (isNaN(date.getTime())) continue;

    // Next line after date should be slot count
    const countLine = lines[i + 2] ?? "";
    const countMatch = countLine.match(/^(\d+)\s+slots?$/i);
    const noSlots = /^no\s+slots?$/i.test(countLine);
    const count = countMatch ? parseInt(countMatch[1], 10) : noSlots ? 0 : -1;
    if (count === -1) continue; // unexpected format

    const label = `${day} ${monthStr} ${year}`;
    entries.push({ label, date, count });
  }

  if (entries.length === 0) {
    return { slots: [], dateRange: "page scanned", hadWeekView: false };
  }

  // Build date range string (week span)
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const dateRange = `${sorted[0].label} – ${sorted[sorted.length - 1].label}`;

  // Extract available times from "Available slots" section (line containing "available slot")
  // Also scan ALL lines for HH:MM patterns in case the section header differs
  const availIdx = lines.findIndex((l) => /available\s+slot/i.test(l));
  const availTimes: string[] = [];
  if (availIdx !== -1) {
    for (let j = availIdx + 1; j < lines.length; j++) {
      if (/^\d{1,2}:\d{2}$/.test(lines[j])) {
        availTimes.push(lines[j]);
      } else if (availTimes.length > 0) {
        break; // stop after we've collected times and hit non-time content
      }
    }
  }
  // Fallback: collect any HH:MM lines from the whole page body
  if (availTimes.length === 0) {
    for (const l of lines) {
      if (/^\d{1,2}:\d{2}$/.test(l) && !DAY_NAMES.includes(l)) {
        availTimes.push(l);
      }
    }
  }
  console.log("Available times extracted:", availTimes);

  // Build slot strings for days with available slots.
  // When we don't know which times belong to which day, we use all listed times
  // for each day that has slots (conservative: maximises chance of detection).
  const slots: string[] = [];
  for (const entry of entries) {
    if (entry.count <= 0) continue;
    const day = entry.date.getDate();
    const month = MONTH_NAMES[entry.date.getMonth()];
    const year = entry.date.getFullYear();
    if (availTimes.length > 0) {
      for (const t of availTimes) {
        slots.push(`${day} ${month} ${year} ${t}`);
      }
    } else {
      // No times listed — use midnight as a sentinel (date comparison still works)
      slots.push(`${day} ${month} ${year} 00:00`);
    }
  }

  console.log(`Week view parsed: ${entries.length} days, ${entries.filter(e=>e.count>0).length} with slots, ${availTimes.length} times listed`);
  return { slots: [...new Set(slots)], dateRange, hadWeekView: true };
}

function extractDatesFromText(text: string): string[] {
  const pattern =
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/gi;
  return [...new Set((text.match(pattern) ?? []).map((s) => s.trim()))];
}

function extractAvailableSlots(bodyText: string): string[] {
  const lines = bodyText.split("\n");
  const slotLines: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    // Exclude the "You are changing your current exam slot of..." info line
    if (/changing your current exam slot/i.test(line)) continue;
    const hasDate = /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(line);
    const hasTime = /\b\d{1,2}:\d{2}\b/.test(line);
    const hasAvailKeyword = /\b(available|select|choose|book|am|pm|slot)\b/i.test(lower);
    if (hasDate && (hasTime || hasAvailKeyword)) {
      slotLines.push(line.trim());
    }
  }
  if (slotLines.length === 0) {
    return extractDatesFromText(bodyText).filter((d) => /\d{1,2}:\d{2}/.test(d));
  }
  return [...new Set(slotLines)];
}

function parseSlotDate(slotLabel: string): Date | null {
  // Handle "8 December 2026 09:00" — our week-view slot format
  const weekViewMatch = slotLabel.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+(\d{1,2}:\d{2}))?$/);
  if (weekViewMatch) {
    const str = weekViewMatch[4]
      ? `${weekViewMatch[2]} ${weekViewMatch[1]}, ${weekViewMatch[3]} ${weekViewMatch[4]}`
      : `${weekViewMatch[2]} ${weekViewMatch[1]}, ${weekViewMatch[3]}`;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  // Try direct parse first
  const d = new Date(slotLabel);
  if (!isNaN(d.getTime())) return d;
  // Extract a date-like substring (e.g. "25 November 2026" from a longer label)
  const m = slotLabel.match(/(\d{1,2}\s+\w+\s+\d{4}|\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d2 = new Date(m[1]);
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
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
