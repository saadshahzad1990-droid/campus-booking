# Campus Booking (v3)

Book shared rooms, places and machines on campus for as long as you need, with your group, and hand them over on time.

GUI Design & Web Optimization, Cycle 1 (personal product). v3 of [PrintSlot](https://github.com/saadshahzad1990-droid/printslot), rebuilt after user testing of v2 at the maker fair.

**v2 build:** https://campus-booking.netlify.app

## What testers said about v2, and what changed

| # | Feedback on v2 | What v3 does |
|---|---|---|
| 1 | Weekly calendar, needs a full calendar | Month calendar on every booking screen, up to 90 days ahead. Each day shows how free it is (green, yellow, red), closed days are crossed out, and a dot marks days where you already have a booking. A new **Calendar** tab shows all your bookings by month. |
| 2 | Needs full room booking | Rooms, the workbench area and the podcast booth have two modes: **A place** (share the room) or **Whole room** (only you and your group). Whole room is only possible when nobody else is booked in. |
| 3 | Appointment buttons not descriptive | Every time button says the time and what is free ("14:00 · 4 of 6 free", "Booked", "Your booking"). Main buttons say exactly what happens ("Review · Thu 5 Nov, 14:00–16:00", "Book Study room 2.14 · 14:00–16:00", "Check in to Podcast booth"). |
| 4 | Not functional enough, too focused on timing | New: invite people by student ID, say what the booking is for, add equipment, repeat weekly, change the day or time of a booking, booking history, kit list for each space, and updates when someone changes a shared booking. |
| 5 | Longer bookings, merged across sessions, updated for everyone | Time is split into 30-minute sessions. Tap a start and a later session to book everything in between (up to 4 h for rooms, 8 h for 3D printers). A booking right next to one of yours is joined into one, and "Need more time?" adds the next free sessions. Everyone on the booking is told. |
| 6 | Remove the 15-minute pause, keep the 5-minute rule | Bookings run back to back with no gap. Check-in opens 5 minutes before the start, at the same moment the person before gets their 5-minute warning to pack up. |
| 7 | Booking shouldn't stop you booking another room | Having one booking no longer blocks booking a different room or machine at the same time. The app only mentions it ("You also have Study room 2.14 then. That's fine."). |
| 8 | "My bookings" not visible | Tab bar at the bottom: Book, Calendar, My bookings (with a count), Account. |
| 9 | Laser cutter bookable during room bookings | When you book a room you can add the laser cutter for the same time with one tap. On the laser cutter page, "Same time as Study room 2.14" fills in your room's time. |
| 10 | Podcast room needs the same | Same as the laser cutter. |

Look and feel: smoother screen changes, sheets that slide in and out, tap feedback on buttons, and a clearer layout on narrow phones. Motion is switched off for people who turn on "reduce motion".

## How sharing works in this prototype

Bookings are saved in the browser and shared by **every ID that logs in on the same device**. To show it:
- Open two tabs, log in as S-2048 in one and S-1033 in the other, and invite S-1033 to a booking. The second tab updates straight away.
- On a phone, use **Account → Switch person**.

A real version needs a server so bookings are shared across phones.

## Demo mode

On a laptop, the yellow box next to the phone has **demo controls**. On a phone, tap **Demo** in the top bar. They move the app's clock so you can show check-in, the countdown and the 5-minute warning without waiting.

## Limits

- No server: bookings only exist on one device, and other students' bookings are generated sample data.
- Login, emails and push notifications are simulated.
- Opening hours are fixed: Mon–Fri 08:00–22:00, Sat 10:00–18:00, closed on Sundays.

## Run locally

Plain HTML, CSS and JavaScript, no build step:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.
