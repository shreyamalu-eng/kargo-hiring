# Kargo Hiring: UX review, checklist and test rounds

## 1. Who it's for

**Arjun Mehta, founder of Kargo.** He's the hiring manager for every role and has no HR team. He reviews CVs late at night, in the 45 minutes he has between other things. Sometimes that's on a laptop, sometimes on his phone.

What he needs:

- a shortlist he trusts
- enough reasoning to make a call in under 10 minutes
- replies that go out without him drafting or chasing them

What he doesn't need is another tool to manage.

## 2. Design language (from the 4 references)

| Reference trait | How the app applies it |
|---|---|
| Soft, tinted surfaces that blend in rather than contrast | Lavender-grey background (`#f4f3fa`), white cards with soft shadows and no hard borders, a gradient hero card |
| Round edges everywhere | Pill buttons, segmented controls and search (999px). Cards 20–24px, inputs 12px, avatars as rounded squares |
| Buttons that are quiet and part of the surface | Default buttons are tonal (lavender tint with violet text). Only one solid violet primary action per screen |
| One accent colour, calm palette | Violet for actions. The other colours are used only when they mean something |
| Friendly, clear type | Plus Jakarta Sans, sizes 26/18/15/14/12.5, weights 400–700, plus tabular numbers for scores |
| Bottom tab bar and floating + on phone | 5-slot tab bar with a raised centre **+** for adding CVs |
| Icon tiles next to labels | Tinted icon tiles on the brief, the how-it-works steps and the role picker |

**Colour coding, used for meaning only:**

| Colour | Means |
|---|---|
| Violet | You / actions |
| Green | Interview, strong match |
| Blue | Promising score |
| Amber | Recommended decline (detail view only, so the list stays calm) |
| Grey | Neutral / done |
| Rose | Problem |

## 3. Layouts

- **Desktop (≥1024px), horizontal:**
  - sidebar with roles and a waiting count on each
  - header and progress card
  - list and detail side by side, each scrolling on its own
  - a floating action dock at the bottom of the detail
  - keyboard: ↑/↓ or j/k to move between candidates
- **Phone and tablet (<1024px), vertical:**
  - a single column list
  - tapping a person opens a full-screen detail page; the phone's Back button returns to the list
  - a sticky Send / Skip bar
  - a bottom tab bar with a centre **+**
  - content is centred at up to 680px on tablets

## 4. UI/UX checklist

- [x] **One primary action per screen:** "Continue reviewing", "Send invite/decline", "Score N CVs", "Review the shortlist".
- [x] **Information hierarchy:** name, then headline, then score and status. Detail order is recommendation → brief → reasons → email → action.
- [x] **Readability:** 14px body, 1.55–1.65 line height, contrast of at least 4.5:1 on ink colours, long headlines cut off with "…".
- [x] **Colour coding is consistent and never the only signal:** every colour also has text or an icon ("Interview", "Decline", "Sent ✓", "Strong match").
- [x] **Icons:** one line-icon set (1.8px stroke, 24px grid), always paired with a label.
- [x] **Sections:** the list is split into Needs attention → Shortlist (top 5) → Below the line, each with a short explanation.
- [x] **Pages:** Home (per role), Add CVs (3 steps), How it works (flow, privacy, rubric), Sign in. Nothing else.
- [x] **Feedback for every action:** toasts, spinners, a progress bar, "Saved", "Sent to Priya · here's the next one".
- [x] **Empty states:** no candidates, no search results, nothing sent yet, everyone replied.
- [x] **Plain-language errors:** for example "This file is an image, not text", "The AI was busy. Retry in a minute".
- [x] **Undo and safety:** sending needs an inline confirmation instead of a browser pop-up. Removing a candidate needs confirming. Leaving the tab mid-upload triggers a warning.
- [x] **Accessibility:** focus rings, aria labels on icon-only buttons, `aria-current` on the selected person, a progress bar role, and support for reduced-motion settings.
- [x] **Touch targets:** at least 40px, with a 48px primary button on phone.
- [x] **Phone keyboard and viewport:** device-width viewport, sticky bar above the home indicator, one-handed tab bar.
- [x] **Privacy is visible:** a "Contact hidden from AI" chip on every candidate, and the two Data Privacy answers on the How it works page.

## 5. Problem statement → how the app solves it

| From the brief | Solution in the app |
|---|---|
| 60 applications, 19 opened, 0 offers | Everyone is scored automatically; the progress card shows "replied to X of Y" |
| "Every review starts from scratch" | The ranking and a per-criterion reason for every candidate are kept, so no review is repeated |
| "No record of why anyone was shortlisted or passed" | An **Export decisions** CSV with rank, score, each criterion with its reason, the decision and the send time |
| Spec ≠ who succeeds; the signal sits in his past hires | Rubric built from the *Exceeds* hires. "Where each criterion came from" names the hire behind each one |
| "Who they are, why ranked here, what to probe" | A 3-part brief: *Who they are / Why they're #N / Ask in the interview* |
| "Look, decide, move" | Send → the next person who still needs a reply opens by itself. **Skip** is always available |
| Nothing goes out without him (the Cut) | No auto-send and no auto-reject; every send is one click plus a confirmation, and only the allowed test domain can be emailed |
| 19 people heard nothing, which hurts Kargo's reputation | Every candidate gets a draft decline. "N still waiting to hear from you" is counted on the home screen and in the sidebar |
| Two strong candidates got "let's chat" and nothing happened | The invite asks for 2–3 time slots, so it's concrete and not a vague "let's chat" |
| Scored for both roles | Both scores are shown. If the other role scores 10+ points higher, a "Move" suggestion appears |
| Top of a weak pool looks like a green light | Weak-but-top candidates are flagged: "Top of this pool, but a weak match overall" |
| He works late, on his phone | A full phone layout, a password lock and a greeting based on time of day |

## 6. Five test rounds (run with the real 60 CVs against local stand-ins for Neon, Gemini and Resend)

| Round | Scenario | Problems found → fixed |
|---|---|---|
| 1 | First visit: sign in, empty state, upload 3 CVs, first shortlist (desktop) | Sidebar counts wrapped onto two lines → compact count pills. The recommendation banner turned amber before its draft existed → colour now follows the recommendation. The Send button was below the fold → floating action dock |
| 2 | Bulk upload of 44 files, including an image and an empty text file | The list was cut off below the fold → the list and detail now scroll separately in an app-style layout. Problem files were buried → "Needs attention" moved to the top, and failures sort first after upload. 41 amber "Decline" tags were loud → neutral grey in the list |
| 3 | Review and send: confirm, auto-advance, edit, override, keyboard, search, move | A sent person stayed under "To reply" for a moment → the list updates immediately. A new candidate opened at the old scroll position → scroll resets to the top. Keyboard selection went off-screen → the selected row scrolls into view. The toast covered the dock → toast moved to the top |
| 4 | A run of declines, Sent filter, CSV export, Senior PM tab, How it works | A top candidate scoring 37 said "Recommended: interview" → it now warns that this is a weak match overall. 5 decisions took 2.3s with the stand-ins; 61 CSV rows were exported correctly |
| 5 | Full phone flow (iPhone 13): sign in, list, detail, send, Back, upload, How it works | **Bug:** the detail screen opened by itself on phones → layout mode is now detected before anything is auto-selected. The Send/Skip bar took two lines → one row. Back and previous/next arrows looked identical → previous/next are now chevrons in a pill. After sending, the next person opened scrolled down → it now resets to the top |
