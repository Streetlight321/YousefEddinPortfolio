# Center360 Attendance Check-In

A single-page kiosk app for Center360 students to check in by selecting their name from a searchable dropdown. The frontend talks to a small backend that reads and writes a Google Sheet via a service account.

## Stack

- **Frontend:** plain HTML, CSS, JavaScript (no build step)
- **Dropdown:** [Tom Select](https://tom-select.js.org/) via CDN
- **Font:** Inter via Google Fonts
- **Backend (to be added):** Node/Express or Python/Flask, talks to Google Sheets API

## File layout

```
Center360_Demos/
├── index.html        # markup
├── styles.css        # all styles (incl. Tom Select overrides)
├── app.js            # fetch + check-in logic
├── Center360_Logo.png
├── .env              # secrets — NOT committed
├── .env.example      # template for .env
├── .gitignore
└── README.md
```

## Setup

1. **Clone & enter the directory**
   ```bash
   git clone <repo-url>
   cd Center360_Demos
   ```

2. **Create a Google service account**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a service account, generate a JSON key
   - Share the target Google Sheet with the service account's email (`client_email` in the JSON)

3. **Create `.env`** from the template
   ```bash
   cp .env.example .env
   ```
   Fill in the values from the downloaded JSON key:
   - `GOOGLE_PROJECT_ID`
   - `GOOGLE_PRIVATE_KEY_ID`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_PRIVATE_KEY` — keep the literal `\n` escapes inside double quotes
   - `GOOGLE_SHEET_ID` — the ID from your sheet's URL

4. **Run a static file server + the backend** (backend not yet included). For local frontend-only smoke testing:
   ```bash
   python3 -m http.server 3000
   # open http://localhost:3000
   ```
   Note: `/api/students` and `/api/checkin` will 404 until the backend is added.

## Google Sheet schema

The app expects two tabs on the configured sheet:

**`Student_Overview`** (master student table)

| Column | Field        |
|--------|--------------|
| A      | ID           |
| B      | First Name   |
| C      | Last Name    |
| D      | GradeID      |
| E      | DateEnrolled |
| F      | Shirt Size   |
| G      | Notes        |

Data starts on row 2.

**`Daily_Attendance`** (append-only log)

| Column | Field         |
|--------|---------------|
| A      | Date          |
| B      | Student_ID    |
| C      | Name          |
| D      | Program       |
| E      | Check-In-Time |

## API contract

The frontend assumes the following endpoints exist on the same origin:

### `GET /api/students`
Returns the student list for the dropdown.
```json
[
  { "id": "S001", "firstName": "Maria", "lastName": "Gonzalez" },
  { "id": "S002", "firstName": "James", "lastName": "Lee" }
]
```

### `POST /api/checkin`
Body:
```json
{ "id": "S001", "name": "Maria Gonzalez" }
```
Response:
```json
{ "success": true }
```
Backend should use the `id` to look up `Program` (and re-verify `Name`) from `Student_Overview`, then append `[today's date, id, name, program, current time]` to `Daily_Attendance`.

## Security notes

- Never commit `.env` or the service account JSON. Both are listed in `.gitignore`.
- The kiosk frontend has no authentication — it's intended to run on a trusted device.
- Rotate the service account key if it is ever exposed.

## Design

- Background: `#ffffff`
- Primary: `#282a73`
- Logo max-width: 220px
- Dropdown max-width: 380px
- Touch-friendly targets (52px+) for iPad kiosk use
