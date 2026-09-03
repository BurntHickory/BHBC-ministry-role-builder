# Ministry Role Profile Builder

An interactive tool for building Burnt Hickory Baptist Church's Ministry Role Profiles (Team Member, Leader, and Coach levels) from a simple interview-style form. Answers generate a live, formatted preview and can be downloaded as a Word (.docx) document that matches the official Ministry Role Profile template — fonts, colors, and styling included.

## Using the tool

1. Open the live site (see the deployment URL in this repo's Vercel project, or ask whoever set it up to share it).
2. Pick a level — **Team Member**, **Leader**, or **Coach** — using the tabs at the top.
3. Fill in the position basics, responsibilities, qualifications, time commitment, and any role-specific notes. The preview on the right updates as you type.
4. Click **Download This Role (.docx)** to save that single profile as a Word document, ready to send or print.
5. To build a full packet for one ministry, click **Add to Ministry Packet** after finishing each role, then **Download Full Packet (.docx)** once all three levels are added — this produces one Word document with all the roles, each starting on a new page.

## How it works

This is a single self-contained HTML file (`index.html`) — no server, database, or build step required. All of the form logic, live preview, and Word-document generation run directly in the browser using the open-source `docx` library, which is bundled inline in the file. Nothing you type is sent anywhere; it only leaves your browser when you click a download button.

## Updating the tool

To make changes (wording, template content, new fields, styling):

1. Edit `index.html` directly, or ask Claude to make the change and produce an updated copy.
2. In this repo, use **Add file → Upload files** and upload the new `index.html` over the old one, then commit.
3. If this repo is connected to Vercel, it will automatically redeploy to the same live URL within a minute or two — no further steps needed.

## Maintained by

Burnt Hickory Baptist Church — Leadership Pipeline initiative.
