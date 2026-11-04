# Varsa Group LLC cashier interviews

This is a one-page website where people can book a 20-minute cashier interview for the Chevron and OutRun stores on Hwy 43 in Thomasville, Alabama.

Interviews run Monday, November 9 through Friday, November 13, 2026, from 9:00 AM to 5:00 PM Central. Nothing is scheduled from 12:00 to 1:00 PM.

The times and the bookings live in the Google Sheet **Varsa Group LLC - Cashier Interview Schedule**. Applicants never open that sheet. They only open this page. The sheet can stay private.

There are no passwords or API keys in this project. The page only needs the public web address of a small script that lives inside the sheet.

## Column layout the script expects

The script finds each column by its header name. The columns can be in any order. Row 1 must be the headers. Times and bookings start on row 2.

The script does not change the **Schedule View** tab or the **How it works** tab.

### Slots

| Column | What it means |
| --- | --- |
| Slot ID | A unique name for that time, such as `20261109-0900` |
| Date | The day, such as `2026-11-09` |
| Day | Monday, Tuesday, Wednesday, Thursday, or Friday |
| Start | Start time, such as `9:00 AM` |
| End | End time, such as `9:20 AM` |
| Status | `open` or `booked`. A blank status counts as open. |
| Booked By | Filled in when someone books |
| Booking ID | Filled in when someone books |

There should be 105 rows: 21 times a day for 5 days. Each interview is 20 minutes. The morning block is 9:00, 9:20, 9:40, 10:00, 10:20, 10:40, 11:00, 11:20, and 11:40. The afternoon block is 1:00, 1:20, 1:40, 2:00, 2:20, 2:40, 3:00, 3:20, 3:40, 4:00, 4:20, and 4:40. The last afternoon interview ends at 5:00 PM.

If a header name is different, rename that header cell. Do not paste over the times underneath.

Header row, if you need to add one:

```
Slot ID	Date	Day	Start	End	Status	Booked By	Booking ID
```

Click cell A1 and paste. If the whole line lands in one cell, use **Data → Split text to columns** and choose Tab.

### Bookings

| Column | What it means |
| --- | --- |
| Booking ID | A reference like `VG-AB23CD45` |
| Slot ID | Which time they took |
| Date | Interview date |
| Day | Weekday |
| Start | Start time |
| End | End time |
| Applicant Name | The person coming in |
| Phone | Their phone number |
| Email | Their email |
| Store Preference | Chevron, OutRun, or Either |
| Booked At | When they booked, Central time |
| Calendar Event ID | Filled in when the calendar event is created |
| Email Status | Whether the confirmation email went out |
| Status | `confirmed` |

Header row, if the Bookings tab is empty:

```
Booking ID	Slot ID	Date	Day	Start	End	Applicant Name	Phone	Email	Store Preference	Booked At	Calendar Event ID	Email Status	Status
```

## 1. Set the sheet time zone

1. Open the sheet [Varsa Group LLC - Cashier Interview Schedule](https://docs.google.com/spreadsheets/d/1rNQhs2MDWBIzEeoPyCwCr8gcTunLHLJpwCcxGxv69EI/edit).
2. Choose **File → Settings**.
3. Set **Time zone** to **Central Time (America/Chicago)**.
4. Save.

## 2. Paste the script into the sheet

1. In the sheet, choose **Extensions → Apps Script**.
2. If code is already there, select all of it and delete it. An older draft may have been written for a Google Form. This page replaces that.
3. Open `apps-script/Code.gs` from this project. Select all of it, copy it, and paste it into the editor. The file name in the editor can stay `Code.gs`.
4. Click the gear icon, **Project Settings**.
5. Turn on **Show "appsscript.json" manifest file in editor**.
6. Go back to the editor (the `< >` icon). Open `appsscript.json`. Replace everything in it with the contents of `apps-script/appsscript.json` from this project.
7. Click the disk icon to save.
8. You can rename the Apps Script project to `Varsa interview booking` if you want.

Near the top of `Code.gs` you can change three lines later if you need to:

- `NOTIFY_EMAIL` is `varun.shah@gmail.com`. That inbox gets a copy of every booking, and replies from applicants go there.
- `LOCATION` and `LOCATION_LINE` are what the calendar and the confirmation say about the place. Change them if everyone should come to one exact door.

## 3. Check the columns

1. Reload the Google Sheet so the new menu appears.
2. Choose **Interview schedule → Check column headers**.
3. The first time, Google asks for permission. Click **Allow**.
4. If Google says the app is not verified, click **Advanced**, then **Go to Varsa interview booking (unsafe)**. That warning is normal for a script you just pasted. It is your script, running in your sheet.
5. Read the message. It should say the Slots headers match, how many times are listed, and that the time zone is Central.

If Slots already has the 105 times, leave them alone.

If the Slots tab is empty, choose **Interview schedule → Add 105 times if Slots is empty**. That menu item refuses to run when any times are already listed, so it will not wipe a schedule.

## 4. Publish the script so the page can use it

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear next to **Select type**, and choose **Web app**.
3. Description: `Cashier interview booking`.
4. **Execute as:** Me.
5. **Who has access:** **Anyone**.
6. Do not choose **Anyone with a Google account**. Applicants should not need to sign in.
7. Click **Deploy**.
8. If Google asks you to authorize, allow calendar access and permission to send email. Use the Advanced link from step 3 if the unverified-app warning shows up again.
9. Copy the **Web app URL**. It ends in `/exec`.

Open that URL in a browser tab while you are logged in as the sheet owner. You should see a block of text starting with `{"ok":true`. That means the page can read the open times. You should also see `"version":"1"`.

The calendar event is created on the Google Calendar of the account you deployed as. The event title is `Interview: Name (Cashier)`. Confirmation email is sent to the applicant and to `varun.shah@gmail.com`. The message the applicant sees comes from the Gmail account that owns the deployment. Replies go to `varun.shah@gmail.com`.

## 5. Connect the page

1. Open `js/app.js`.
2. Find this line near the top. It is the only place the page stores the link:

```javascript
var WEB_APP_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
```

3. Replace the placeholder with your `/exec` URL. Keep the quotes.

```javascript
var WEB_APP_URL = 'https://script.google.com/macros/s/your-id/exec';
```

Until that line is filled in, the page shows sample times and labels itself as a preview. Preview bookings are not saved.

You can double-click `index.html` before you host it, to look at the preview. The `css` and `js` folders need to stay next to `index.html`.

## 6. Put the page on the internet

Applicants need a normal link, not a file on your computer.

### Free option: Netlify

GitHub Pages will not publish this private repository on a free GitHub plan. A private repository needs a paid GitHub plan before Pages will turn on.

Netlify Drop is free:

1. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop).
2. On your computer, keep `index.html`, the `css` folder, and the `js` folder together. The `apps-script` folder does not have to be on the website.
3. Drag that folder onto the Netlify page.
4. Netlify gives you a link that ends in `netlify.app`. Send that link to applicants.

Drop gives a new link every time you drag the folder. For a link that stays the same, create a free Netlify account, choose **Add new site → Deploy manually**, and upload the same folder. Later uploads update that same link.

### Free option: a public page repository

You can also make a new **public** GitHub repository that contains only `index.html`, `css`, and `js`. Those files do not contain a password. In that public repository, open **Settings → Pages → Deploy from a branch**, choose `main` and `/ (root)`, and save. The page will be at `https://USERNAME.github.io/REPOSITORY/`.

The empty `.nojekyll` file tells GitHub Pages to serve the files as they are. Leave it in place.

The Apps Script stays in the Google Sheet either way. You do not put the sheet’s private sharing settings into the page.

## 7. Make a test booking

1. Open the hosted page on your phone and on a computer.
2. The preview banner should be gone.
3. Pick a time, enter your own name, phone, and email, and book it.
4. The page should say **You’re booked** and show the time.
5. Check the inbox you typed (and the spam folder).
6. Check `varun.shah@gmail.com`.
7. On the **Bookings** tab, a new row should be there.
8. On the **Slots** tab, that time’s Status should say `booked`.
9. On Google Calendar, there should be an event named `Interview: Your Name (Cashier)`.

### Undo the test so the time is free again

1. On **Bookings**, right-click the test row number and choose **Delete row**.
2. On **Slots**, find the same Slot ID. Set Status back to `open`. Clear **Booked By** and **Booking ID**.
3. On Google Calendar, open the test event and delete it.

If you leave the slot marked `booked`, nobody else can take that time. If you leave the Bookings row in place with Status `confirmed`, that email address cannot book a second time.

## If you change the script later

Saving in the editor is not enough. The live page keeps running the last published copy.

1. Click **Deploy → Manage deployments**.
2. Click the pencil on the existing web app.
3. Under **Version**, choose **New version**.
4. Click **Deploy**.

The web address stays the same. You do not have to paste a new URL into `js/app.js` unless you created a brand-new deployment.

If you change `NOTIFY_EMAIL`, `LOCATION`, or `LOCATION_LINE`, publish a new version the same way.

## How double-booking is stopped

When someone books, the script locks the schedule for a moment, checks that the time is still open, writes the Bookings row, and marks the slot `booked`. Then it unlocks. Two people cannot be given the same time. If the second person is too late, the page says: **That time was just taken. Please pick another.**

Each email address can hold one interview. Booking the same time again with the same email shows the confirmation they already have, and does not send a second email.

## Email limits

A regular Gmail account can send about 100 email recipients per day. Each booking sends two messages: one to the applicant and one to `varun.shah@gmail.com`. That is about 50 bookings a day before Gmail stops sending. The booking is still saved if the email limit is hit. The page tells the applicant to write the time down. A Google Workspace account can send many more.

Calendar invitations are separate from those emails. The applicant and the notification inbox are added to the event when Google allows it.

## If something looks wrong

**The page still says Preview.**  
`WEB_APP_URL` in `js/app.js` is empty or is not an `https://script.google.com/macros/s/.../exec` link.

**Opening the web app URL shows a Google sign-in page.**  
The deployment access is probably “Anyone with a Google account.” Change it to **Anyone**, publish a new version, and open the `/exec` link again.

**The page says the booking link did not return interview times.**  
Open the `/exec` URL yourself. You want text that starts with `{"ok":true`. If you see a permission prompt, allow it. If the headers are wrong, the text will say which column is missing. Run **Interview schedule → Check column headers**.

**The times on the calendar are an hour off.**  
The sheet time zone is not Central. Use **File → Settings** and set Central Time, then run **Check column headers** again.

**You edited the script and the page still behaves the old way.**  
Publish a new version, as described above. The page itself always asks for a fresh list of times.

**Two people grabbed the same minute.**  
Only one booking should be on that Slot ID. The other person should have seen “That time was just taken.” If a row was edited by hand while someone was booking, set the extra row aside and keep a single `booked` slot.

**An applicant needs a different time.**  
Delete or cancel their Bookings row (set Status to `cancelled`), set that slot back to `open`, and delete the calendar event. They can book again from the page. There is no public cancel link, so strangers cannot wipe the schedule.
