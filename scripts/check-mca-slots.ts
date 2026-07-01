import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const MCA_SDS_NUMBER = process.env.MCA_SDS_NUMBER!;
const MCA_DOB = process.env.MCA_DOB!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL!;
const TARGET_DATE = process.env.TARGET_DATE ?? "2025-11-25";

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
    await page.goto(
      "https://mymca-prod.powerappsportals.com/book_and_manage_an_oral_exam/",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    // Wait for page to settle
    await page.waitForTimeout(5000);

    // Accept cookie consent banner
    const cookieSelectors = [
      '#cookies-accept',
      'button:has-text("Accept all")',
      'button:has-text("Accept cookies")',
      'button:has-text("Accept")',
      '[data-testid="cookie-accept"]',
    ];
    for (const sel of cookieSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log(`Accepting cookies via: ${sel}`);
        await btn.click();
        break;
      }
    }

    // Wait for portal to fully render after cookie acceptance
    await page.waitForTimeout(8000);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await page.screenshot({ path: `screenshot-after-cookies-${Date.now()}.png`, fullPage: true });

    // Log page structure
    const pageTitle = await page.title();
    console.log("Page title:", pageTitle);
    console.log("Page URL:", page.url());

    // Check for iframes
    const frames = page.frames();
    console.log(`Found ${frames.length} frames on page`);
    for (const frame of frames) {
      console.log(`  Frame URL: ${frame.url()}`);
    }

    // Try to find inputs in the main page first
    const mainInputs = await page.locator("input:not([type='hidden']), select, textarea").all();
    console.log(`Main frame has ${mainInputs.length} visible form elements`);
    for (const el of mainInputs) {
      const name = await el.getAttribute("name").catch(() => "");
      const id = await el.getAttribute("id").catch(() => "");
      const type = await el.getAttribute("type").catch(() => "");
      const placeholder = await el.getAttribute("placeholder").catch(() => "");
      console.log(`  INPUT name="${name}" id="${id}" type="${type}" placeholder="${placeholder}"`);
    }

    // Log all buttons/links on the page to find the right CTA
    const allButtons = await page.locator("a, button").all();
    console.log(`Found ${allButtons.length} buttons/links on landing page:`);
    for (const btn of allButtons.slice(0, 20)) {
      const text = await btn.textContent().catch(() => "");
      const href = await btn.getAttribute("href").catch(() => "");
      if (text?.trim()) console.log(`  BUTTON/LINK: "${text.trim()}" href="${href}"`);
    }

    // If no form inputs visible, the landing page needs a CTA click first
    if (mainInputs.length === 0) {
      console.log("No form inputs on landing page — looking for CTA button to start booking flow...");
      const ctaSelectors = [
        'a:has-text("Book")',
        'a:has-text("book")',
        'button:has-text("Book")',
        'a:has-text("Start")',
        'a:has-text("Manage")',
        'a:has-text("Apply")',
        'a:has-text("Continue")',
        'a[href*="book"]',
        'a[href*="oral"]',
        '.cta a',
        '.button',
        'a.btn',
        'button.btn',
      ];

      let ctaClicked = false;
      for (const sel of ctaSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          const text = await el.textContent().catch(() => "");
          console.log(`Clicking CTA: "${text?.trim()}" via ${sel}`);
          await el.click();
          ctaClicked = true;
          break;
        }
      }

      if (ctaClicked) {
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(5000);
        console.log("After CTA click — URL:", page.url());
        await page.screenshot({ path: `screenshot-after-cta-${Date.now()}.png`, fullPage: true });

        const postCtaInputs = await page.locator("input:not([type='hidden'])").all();
        console.log(`Post-CTA: found ${postCtaInputs.length} inputs`);
      } else {
        console.log("No CTA found — dumping all page text for inspection:");
        const bodyText = await page.locator("body").innerText().catch(() => "");
        console.log(bodyText.slice(0, 2000));
      }
    }

    // Try each iframe for inputs
    const framesAfterCta = page.frames();
    let targetFrame = page.mainFrame();
    for (const frame of framesAfterCta) {
      if (frame === page.mainFrame()) continue;
      const frameInputs = await frame.locator("input:not([type='hidden'])").all();
      console.log(`Frame ${frame.url()} has ${frameInputs.length} inputs`);
      if (frameInputs.length > 0) {
        targetFrame = frame;
        break;
      }
    }

    // Shared submit button selectors used across steps
    const submitSelectors = [
      'button:has-text("Continue")',
      'button:has-text("Submit")',
      'button:has-text("Verify")',
      'button:has-text("Search")',
      'button:has-text("Find")',
      'input[type="submit"]',
      'button[type="submit"]',
    ];

    // Fill SDS number — try common field patterns
    const sdsSelectors = [
      'input[name*="sds" i]',
      'input[id*="sds" i]',
      'input[placeholder*="SDS" i]',
      'input[placeholder*="seafarer" i]',
      'input[placeholder*="reference" i]',
      'input[aria-label*="sds" i]',
      'input[aria-label*="seafarer" i]',
      'input[type="text"]:first-of-type',
    ];

    let sdsFilled = false;
    for (const sel of sdsSelectors) {
      const el = targetFrame.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.fill(MCA_SDS_NUMBER);
        console.log(`Filled SDS using selector: ${sel}`);
        sdsFilled = true;
        break;
      }
    }

    if (!sdsFilled) {
      // Last resort: fill first visible text input
      const firstInput = targetFrame.locator("input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='submit'])").first();
      await firstInput.waitFor({ timeout: 20000 });
      await firstInput.fill(MCA_SDS_NUMBER);
      console.log("Filled SDS using first available input");
    }

    await page.screenshot({ path: `screenshot-filled-${Date.now()}.png`, fullPage: true });

    // Submit SDS form
    for (const sel of submitSelectors) {
      const btn = targetFrame.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        console.log(`Clicked submit via: ${sel}`);
        break;
      }
    }

    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log("After SDS submit — now on:", page.url());

    // Step 2: If we land on the DOB page, fill it and submit
    if (page.url().includes("date_of_birth") || page.url().includes("dob")) {
      console.log("On DOB page — filling date of birth...");
      await page.screenshot({ path: `screenshot-dob-page-${Date.now()}.png`, fullPage: true });

      const dobSelectors = [
        'input[name*="dob" i]',
        'input[id*="dob" i]',
        'input[placeholder*="DD/MM/YYYY" i]',
        'input[placeholder*="date" i]',
        'input[type="date"]',
        'input[aria-label*="birth" i]',
        'input[aria-label*="dob" i]',
        'input[type="text"]',
      ];

      let dobFilled = false;
      for (const sel of dobSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.fill(MCA_DOB);
          console.log(`Filled DOB using selector: ${sel}`);
          dobFilled = true;
          break;
        }
      }

      if (!dobFilled) {
        console.warn("Could not find DOB input on DOB page");
      }

      // Submit DOB form
      for (const sel of submitSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          console.log(`Clicked DOB submit via: ${sel}`);
          break;
        }
      }

      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log("After DOB submit — now on:", page.url());
    }

    await page.screenshot({ path: `screenshot-after-submit-${Date.now()}.png`, fullPage: true });

    const pageContent = await page.content();
    const slots = await extractSlots(page);
    console.log(`Found ${slots.length} available slot(s):`, slots);

    const { error: insertErr } = await supabase.from("checks").insert({
      checked_at: new Date().toISOString(),
      slots_found: slots,
      slot_count: slots.length,
      page_snapshot: pageContent.slice(0, 5000),
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
    await page.screenshot({ path: `screenshot-failure-${Date.now()}.png`, fullPage: true }).catch(() => {});
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

  const dateEls = await page.locator('[class*="calendar"] [class*="day"]:not([class*="disabled"]):not([class*="past"])').all();
  for (const el of dateEls) {
    const text = await el.textContent().catch(() => "");
    if (text?.trim()) slots.push(text.trim());
  }

  if (slots.length === 0) {
    const options = await page.locator('select option, [role="option"]').all();
    for (const opt of options) {
      const text = await opt.textContent().catch(() => "");
      if (text && /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(text)) {
        slots.push(text.trim());
      }
    }
  }

  if (slots.length === 0) {
    const buttons = await page.locator('button:has-text("available"), [class*="slot"]:not([class*="taken"]):not([class*="disabled"])').all();
    for (const btn of buttons) {
      const text = await btn.textContent().catch(() => "");
      if (text?.trim()) slots.push(text.trim());
    }
  }

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
