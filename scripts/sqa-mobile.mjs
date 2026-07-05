/** Mobile viewport SQA */
import puppeteer from "puppeteer";
const BASE = process.env.SMOKE_URL || "http://localhost:3080";
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${BASE}/learn.html?m=00-prerequisites&l=readme`, { waitUntil: "networkidle0" });
await page.click("#sidebar-toggle");
const open = await page.evaluate(() => document.getElementById("reader-sidebar")?.classList.contains("open"));
const searchVisible = await page.evaluate(() => !!document.getElementById("sidebar-search"));
console.log(JSON.stringify({ sidebarOpens: open, searchOnMobile: searchVisible }));
await browser.close();
process.exit(open && searchVisible ? 0 : 1);
