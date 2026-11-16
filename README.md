# Burnt Hickory Ministry Role Packet Builder (v2 preview)

This is the refreshed version of the role builder. It is a local preview: nothing here touches the live site or the GitHub repo.

## How to open it

Double-click `index.html`. It opens in your browser and works offline. No install needed.

## What is in it

- **Build a packet.** Pick a ministry area, a team, and a role. The four-part packet shows on the right. Download it as a Word file or print it to PDF.
- **Edit content.** Every word is editable.
  - Part 1 (Burnt Hickory, for everyone) is stored once. Change the mission or vision here and every future packet updates.
  - Part 2 is stored once per ministry area, and Part 3 once per team.
  - Part 4 is stored per role, including its qualifications, screening level, time commitment, and training. Each role can have different requirements.
  - You can add areas, teams, and roles, duplicate a role, restore any item to its original wording, and download or load a backup file.
- **Starting content** comes from the 28 finished packets (Hospitality, LifeGroups, Prayer Ministry, Women's Ministry).

## Demo mode

Edits are saved in this browser only, and there is no sign-in yet. The next step is to move saving to Vercel storage with an admin password, so everyone sees the same content. The code for that is isolated in `js/store.js`.

## Folder map

- `index.html`: the page
- `css/app.css`: brand styles (teal, cream, Montserrat, Open Sans)
- `css/fonts.css`: the fonts, embedded so the page works offline
- `js/content.seed.js`: the starting packet content
- `js/store.js`: saving and restoring content
- `js/render.js`: the packet preview
- `js/docx-export.js`: the Word export (fonts are embedded in the file)
- `js/build.js`, `js/admin.js`, `js/main.js`: the two screens
- `js/assets.js`: the logo
- `vendor/docx.umd.js`: the library that writes Word files

## Known gaps

- The logo is a placeholder made from a small file in the design system (the badge is slightly clipped at its left edge). Swap in a high-resolution or SVG logo for a sharper result.
- Word shows the brand fonts because they are embedded in the file. Word for the web and Google Docs ignore embedded fonts and will substitute.

## New in this version

- **Collapsible menu.** In Build a packet, only ministry areas show at first. Open an area to see its teams, then a team to see its roles. The search box opens matches automatically.
- **Upload a document.** The "Upload a document" button reads a Word (.docx) or PDF file in the browser, finds the area, team, and role, and asks you to confirm before adding it. Full four-part packets and single role descriptions both work. PDFs lose some table formatting, so check each section afterward.
