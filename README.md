# Campus Booking (v2)

Book shared rooms and equipment on campus for a set time, check in, and hand them over on time.

**Live build:** https://campus-booking.netlify.app

Week 4 build for *GUI Design & Web Optimization* (Cycle 1, personal product). v2 of [PrintSlot](https://github.com/saadshahzad1990-droid/printslot), rebuilt from the Week 3 research and the Week 4 lo-fi prototype.

## The problem

People who share spaces and equipment at institutions can't see when things are free, and bookings run over, so the next person loses time.

**Design goal:** help people who share spaces and equipment book and use their time accurately, so they start and finish on time.

## What the app does (one screen per step of the lo-fi prototype)

1. **Log in with your ID**: every booking belongs to one person.
2. **See what's free right now**, and how many people are in a room, without walking there.
3. **Pick a day, a fixed length (15 min to 4 h, depending on the item) and a start time.** Each slot shows how many places are taken; full slots can't be booked, and the longest allowed booking is always shown.
4. **Check and confirm**: the end time and house rules are shown before you confirm.
5. **Booked**: confirmation (simulated email), reminders, add to calendar (.ics), change or cancel.
6. **Check in on arrival**: a quick checklist and a damage report with a photo, filed under your ID.
7. **In use**: a countdown, a 5-minute warning, and "add 15 min" only if the next slot is free.
8. **Check out**: a short checklist; finishing early frees the rest of the slot for others.

## Changes from v1 (PrintSlot)

- From one 3D printer to any shared space or machine (rooms, printers, laser cutter, workbench, podcast booth).
- Booking tied to a personal ID instead of a typed name.
- Capacity per slot ("2 of 6 taken") for rooms and areas.
- New: check-in, damage reports, countdown, 5-minute warning, check-out.
- Fixes from the Week 2 heuristic evaluation: the booking tool is at the top, limits are always shown, and errors say what to do next.

## Demo mode

On a laptop, the panel next to the phone has **demo controls**. On a phone, tap **Demo** in the top bar. They move the app's clock so you can show check-in, the countdown and the 5-minute warning without waiting.

## Limits of this prototype

- Bookings are saved in the browser (localStorage), so they are not shared between devices. Other people's bookings are generated sample data.
- Login, emails and reminders are simulated.
- A real version needs a shared backend that runs the same overlap check for everyone.

## Run locally

Plain HTML, CSS and JavaScript, no build step:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.
