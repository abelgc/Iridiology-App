# Manual Test Checklist

Base URL: `http://localhost:3000`
Run the app first: `npm run dev`

---

## 1. Admin Login

URL: `http://localhost:3000/login`

- [x] Page loads with the Narasimha Solutions logo
- [x] Enter valid email + password → redirects to dashboard `/`
- [x] Enter wrong password → shows error message
- [x] Leave fields empty → shows validation errors

---

## 2. Dashboard (Admin)

URL: `http://localhost:3000/`

- [x] Sidebar is visible with links: Patients, Reports, Settings
- [x] Header shows logo and user info
- [x] Navigating to each sidebar link works without a full page reload

---

## 3. Patients

### List
URL: `http://localhost:3000/patients`

- [ ] Patient list loads
- [ ] "New patient" button is visible and clickable

### Create
URL: `http://localhost:3000/patients/new`

- [ ] Form renders all fields
- [ ] Submitting with empty required fields shows validation errors
- [ ] Submitting valid data creates the patient and redirects to the patient page

### Patient detail
URL: `http://localhost:3000/patients/<id>`

- [ ] Patient info is displayed
- [ ] Sessions table is visible
- [ ] "Edit" link navigates to edit page

### Edit
URL: `http://localhost:3000/patients/<id>/edit`

- [ ] Form pre-filled with existing data
- [ ] Saving updates the patient

---

## 4. Sessions

### New session
URL: `http://localhost:3000/sessions/new`

- [ ] Requires a patient to be linked
- [ ] Submitting creates a session and navigates to session detail

### Session detail
URL: `http://localhost:3000/sessions/<id>`

- [ ] Session data displayed
- [ ] Link to the associated report (if generated)

---

## 5. Reports

### Report detail
URL: `http://localhost:3000/reports/<id>`

- [ ] Report sections render correctly
- [ ] No layout breakage on long content

### Report edit
URL: `http://localhost:3000/reports/<id>/edit`

- [ ] Editable fields are present
- [ ] Save works

### Report chat
URL: `http://localhost:3000/reports/<id>/chat`

- [ ] Chat input is visible
- [ ] Sending a message returns a response
- [ ] Message history scrolls correctly

---

## 6. Settings

URL: `http://localhost:3000/settings`

- [ ] Page loads without errors
- [ ] Any settings forms save correctly

---

## 7. Client Flow (end-to-end)

### Step 1 — Landing / Tier selection
URL: `http://localhost:3000/client`

- [ ] Language toggle visible and works (EN ↔ ES)
- [ ] Two tier cards shown: Basic and Premium
- [ ] Clicking Basic → navigates to `/client/intake`
- [ ] Clicking Premium → navigates to `/client/intake`
- [ ] Navigating directly to `/client/intake` without choosing a tier → redirects back to `/client`

### Step 2 — Health questionnaire / Intake form
URL: `http://localhost:3000/client/intake`

- [ ] Form renders all health questionnaire fields
- [ ] Submitting empty required fields shows validation errors
- [ ] Submitting valid data → navigates to `/client/intake/payment`

### Step 3 — Payment
URL: `http://localhost:3000/client/intake/payment`

- [ ] Payment UI renders (mock or real depending on env)
- [ ] Completing payment → navigates to `/client/upload`
- [ ] Skipping payment directly (URL hack) → redirects back if token not set

### Step 4 — Iris image upload
URL: `http://localhost:3000/client/upload`

- [ ] Upload tutorial is shown
- [ ] Can select/drag an image file
- [ ] Uploading a valid image → navigates to `/client/upload/processing`
- [ ] Uploading a non-image file → shows an error

### Step 5 — Processing
URL: `http://localhost:3000/client/upload/processing`

- [ ] Loading state visible while Claude processes
- [ ] On completion → redirects to `/client/report/<token>`

### Step 6 — Client report
URL: `http://localhost:3000/client/report/<token>`

- [ ] Report content renders
- [ ] No raw JSON or broken layout
- [ ] Language matches the one chosen on landing

---

## 8. Brand / Visual

- [ ] Narasimha Solutions logo appears on the login page
- [ ] Narasimha Solutions logo appears in the admin sidebar/header
- [ ] Narasimha Solutions logo appears on the client layout
- [ ] Colors and fonts match the theme (`Narasimha Solutions Theme/handoff/src/app/globals.css`)
- [ ] No old placeholder logo visible anywhere

---

## Notes

- Test both `basic_12` and `premium_19_90` tiers through the full client flow
- Test in Chrome and one mobile viewport (375px width)
- Check browser console for errors at each step
