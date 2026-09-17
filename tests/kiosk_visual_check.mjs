/**
 * Optional live kiosk overflow check.
 *
 * Usage:
 *   node tests/kiosk_visual_check.mjs http://127.0.0.1:8000/
 *
 * Requires Playwright to be installed in the local environment. This is kept
 * separate from the default test suite so the repo does not need a browser
 * dependency just to run backend/unit tests.
 */

const targetUrl = process.argv[2] || "http://127.0.0.1:8000/";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Install it to run kiosk visual checks.");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(targetUrl, { waitUntil: "networkidle" });

const report = await page.evaluate(async () => {
  const scenes = Array.from(document.querySelectorAll("section.kiosk-scene"));
  const issues = [];

  for (const scene of scenes) {
    scenes.forEach((item) => item.classList.remove("active"));
    scene.classList.add("active");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const sceneBox = scene.getBoundingClientRect();
    const offenders = Array.from(scene.querySelectorAll("*")).filter((el) => {
      const box = el.getBoundingClientRect();
      return (
        box.right > sceneBox.right + 4 ||
        box.bottom > sceneBox.bottom + 4 ||
        box.left < sceneBox.left - 4 ||
        box.top < sceneBox.top - 4
      );
    });
    if (offenders.length) {
      issues.push({
        scene: scene.dataset.scene,
        count: offenders.length,
        samples: offenders.slice(0, 3).map((el) => el.textContent.trim().slice(0, 80)),
      });
    }
  }

  return issues;
});

await browser.close();

if (report.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log("Kiosk visual overflow check passed.");
