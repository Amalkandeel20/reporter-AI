<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1PQPTBo-bjLfdEvt2UfmHj7-YlUHA60X-

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `VITE_GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## What We Built
- Mobile-focused AI reporter UI with a 390x844 phone frame, header, and burger menu that routes between Home, Tasks, Camera, Reports, History, and settings/support placeholders.
- Home screen shows live date/time plus a project progress rail that toggles between percent and counts, with quick actions for starting or resuming a report.
- Task manager with add/modify flows, collapsible task cards, and completion toggles. New reports can auto-sync and replace the task list with AI-detected tasks from the processed video.
- Camera upload flow with optional Demo Mode that uploads the full video to Gemini for native analysis, otherwise runs frame-based processing with live status updates.
- Reporting pipeline that detects activity episodes, masks/redacts frames for privacy, asks Gemini for summaries/tasks, and auto-picks before/after frames from candidate stills.
- Reports screen with preview cards, tools/actions chips per episode, PDF export, and a "Chat Edit" tab that asks Gemini to revise the report while staying grounded to what is visible in the video.
- Editing guardrails: new episodes get frames from the candidate set, changes respect timecodes, and a 10-minute timer/Finish & Clear action locks the session and deletes uploaded Gemini video references.

## How to Use the Flow
1. Set `VITE_GEMINI_API_KEY` in `.env.local`.
2. Upload a video from **Camera** (toggle Demo Mode if you want full-video Gemini analysis).
3. Wait for processing; the generated report populates **Reports** and can auto-refresh **Tasks** if auto-sync is on.
4. Use **Chat Edit** to request grounded tweaks; export a PDF or finish/clear to lock the session and drop the Gemini video reference.
