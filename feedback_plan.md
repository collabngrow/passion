# Feedback Survey Plan — Collabngrow Passion Analyzer

## Overview

A **3-question feedback survey** unlocks after the user completes the passion exercise and views their revelations. The survey link is available on the same shareable results page. Responses are stored in Firebase and surfaced in the **Admin Dashboard** under a dedicated "Feedback" tab.

---

## Survey Access & Timing

- The survey section is **locked/hidden** until the exercise is marked complete and revelations have been shown.
- Once unlocked, it appears inline on the results page (below the revelations) OR as a modal/drawer prompt.
- Each user can submit the survey **only once** per exercise session.

---

## The 3 Questions

### Question 1 — "How were the revelations?"

> _Single-select. Measures perceived impact._

| # | Option |
|---|--------|
| 1 | **Totally Unexpected & Mindset-Altering** — I see things differently now |
| 2 | Very Interesting — gave me real insights I hadn't considered |
| 3 | Somewhat Interesting — a few useful takeaways |
| 4 | Not Surprising — I already knew most of this |
| 5 | **This survey was pointless** — I got nothing out of it |

---

### Question 2 — "What would you pay as a customer for a passion test?"

> _Single-select. Measures willingness-to-pay BEFORE experiencing the revelations._
>
> **Curveball preamble shown to user:**
> _"The amount of money you'd spend on something like this also determines your seriousness towards it."_

| # | Option |
|---|--------|
| 1 | I would never pay for a service like this |
| 2 | ₹200 |
| 3 | ₹300 – ₹600 |
| 4 | ₹600 – ₹1,100 |
| 5 | ₹1,100 – ₹2,000 |
| 6 | ₹2,000 – ₹5,000 |
| 7 | ₹5,000 – ₹11,000 |
| 8 | ₹11,000+ |

_(Assume 1 USD ≈ ₹100)_

---

### Question 3 — "What do you think this Collabngrow Passion Survey is actually worth?"

> _Single-select (with write-in option). Measures perceived value AFTER experiencing the revelations._

| # | Option |
|---|--------|
| 1 | I would never pay for a service like this |
| 2 | ₹200 |
| 3 | ₹300 – ₹600 |
| 4 | ₹600 – ₹1,100 |
| 5 | ₹1,100 – ₹2,000 |
| 6 | ₹2,000 – ₹5,000 |
| 7 | ₹5,000 – ₹11,000 |
| 8 | ₹11,000+ |
| 9 | **Custom value** (₹ text input field) |
| 10 | **Priceless** |

---

## Data Model (Firestore)

```
feedbackResponses/{responseId}
├── userId: string
├── userName: string
├── exerciseId: string
├── submittedAt: timestamp
├── q1_revelationImpact: number (1–5)
├── q2_willingnessToPay: number (1–8)
├── q3_perceivedWorth: number (1–10)
├── q3_customValue: number | null  (only if option 9 selected)
```

---

## Admin Dashboard — "Feedback" Tab

### Individual Responses Table

| Column | Description |
|--------|-------------|
| User Name | Name of the respondent |
| Submitted At | Timestamp |
| Q1 — Revelation Impact | Selected option label |
| Q2 — Willingness to Pay | Selected option label |
| Q3 — Perceived Worth | Selected option label (or custom ₹ value) |
| Actions | View full details |

- Sortable & filterable by date, Q1 response, price ranges.
- Click a row to expand full individual survey details.

### Grouped Analysis & Charts

1. **Q1 — Revelation Impact Distribution**
   - Horizontal bar chart / donut chart showing % breakdown across the 5 options.

2. **Q2 vs Q3 — Willingness to Pay vs Perceived Worth**
   - Grouped bar chart comparing the distribution of Q2 and Q3 side-by-side.
   - Shows the "value perception shift" — did users perceive higher worth after experiencing revelations?

3. **Average Perceived Worth**
   - Single stat card showing average ₹ value (mapping option midpoints to numbers, using custom values where provided, excluding "Priceless").
   - Count of users who selected "Priceless" shown separately.

4. **Summary Stats Cards**
   - Total responses
   - % who found it "Mindset-Altering" (Q1 option 1)
   - % who would pay ₹2,000+ (Q2 options 6–8)
   - % who rated worth as ₹2,000+ or Priceless (Q3 options 6–10)

---

## UX Notes

- Survey should feel lightweight and fast — no more than 30 seconds to complete.
- Use clean card-based UI with radio buttons for Q1 & Q2, radio + conditional text input for Q3.
- Show a brief "Thank you" confirmation after submission with a subtle animation.
- Survey cannot be re-submitted (button disabled / section replaced with "Thanks for your feedback!").
