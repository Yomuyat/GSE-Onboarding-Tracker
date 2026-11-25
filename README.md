# GSE Onboarding Tracker

A static onboarding dashboard with a 14-stage galaxy map, a recommended next action, readiness and learning popups, and a pixel character editor. It starts with two fictional profiles; no server or Excel workbook is required.

## Use the dashboard

1. Select an explorer in **Summary**. **Go to stage** opens the next competency below target.
2. Select a planet or use **Previous stage** and **Next stage** to explore. Travel does not change readiness.
3. Use **Update readiness** to record a level and **Edit learning** to update learning status, links, or notes. Select **Save progress** to apply your changes.
4. Use **Create your character** to paint and save your explorer.

Readiness levels are cumulative: **0** Not started, **1** Understanding, **2** Value Proposition, and **3** Demo Capability. Level 3 applies only to Programming & DAQ, PXI & Modular Instruments, TestStand, SystemLink, and CompactRIO. Learning status is tracked separately.

Readiness, learning, characters, and map positions are saved in browser storage for this site. Progress survives reloads in the same browser profile, but does not sync across devices, people, or hosting domains. Clearing site data removes it. There are no accounts or shared database. Do not enter sensitive employee information in this demo.

## Deploy

- **GitHub Pages:** In **Settings > Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, then save. No build command or GitHub token is needed by the site.
- **Cloudflare Pages:** Import the repository, choose `main` as the production branch, select no framework, leave the build command blank, and use `.` as the build output directory.

For local development, serve a clean checkout over HTTP, for example with `py -m http.server 8080 --bind 127.0.0.1`, then open `http://localhost:8080/`.

The legacy workbook and Python backend are not part of this deployment. Existing Excel records are not imported, and the original files remain untouched locally.
