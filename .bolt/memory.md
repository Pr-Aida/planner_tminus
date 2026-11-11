# Project memory

## Product intent & audience

- **T Minus**: study planner and progress tracker app.
- Users create Progress projects and track studied time, pace, and cumulative progress.
- Activities can optionally contribute time to Progress projects via an "Add to Progress" flow.

## Brand personality & voice

- Production-quality, polished UI; not cookie-cutter.
- Technical communication is direct and summary-oriented.

## Visual design & UX direction

- Built with Vite + React (JSX), Tailwind CSS, Lucide React icons.
- No UI theme/icon packages beyond Lucide React unless explicitly requested.
- Progress project detail UI previously had a "Recent Activity" card with activity rows and a "Link Existing Activity" button — **removed**.
- Activity-to-Progress linking remains available only from the Activity form's optional "Add to Progress" flow.

## Decisions, constraints & rationale

- **Recent Activity removal is UI-only**: `planner_progress_contributions` data, existing linked Activity data, Activity→Progress linking from Activity form, studied time/pace/cumulative progress calculations, automatic time contribution, and existing Progress data must not be deleted or broken.
- **Null-safety fix**: `isTimeUnit` crashed when a contribution's resource had been deleted (null). `isTimeUnit`, `formatAmount`, `formatPair`, and `getQuickAddButtons` are now null-safe.
- **Error boundary** now surfaces actual error messages and logs full stack traces to console instead of hiding them.
- Dead code cleanup: unused imports (`Link2`, `Unlink`, `LinkActivityModal`, `removeContribution`), state (`showLinkActivity`), memo (`recentContributions`), and props (`onDeleteContribution`, `allContributions`, `onActivityLinked`) were removed after Recent Activity section deletion.

## Open questions & assumptions

- Assumed removing the Recent Activity UI and its dead code would not affect other components; verified via type-check and build pass.
- No indication whether the "Link Existing Activity" functionality might be needed again in the future — currently fully removed from UI.