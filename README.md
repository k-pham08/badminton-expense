# Badminton — Team Expense Splitter

A React Native (iOS) app for selecting badminton sessions, logging court/shuttlecock costs, and splitting by hours played — pay less if you play fewer hours.

## How to Use

1. **Members**: Enter name and save. Reused across all sessions.
2. **Courts**: Save branch, court name, and **fixed hours** (start/end, 5-min steps). Session just picks a saved court — no need to re-enter hours.
3. **New Month**: Enter **shuttlecock name** and **price per piece**. Pick **play days** (Tue, Fri…) once — applies all month.
4. To change court/players for a specific day, go to that date. Use **Apply to all same days...** to copy to all dates with the same weekday.
5. After playing, open that session:
   - Court: select saved branch + court + time slot. Hours auto-calculated.
   - Monthly shuttlecock count (based on set name/price)
   - Extra shuttlecocks: name, price/piece, count
   - Select saved members, or add new people to the session (will be saved)
   - Someone arrived late/left early: reduce **play hours** for that person. Court + shuttlecock cost divided by hours.
6. Default splits evenly (everyone plays full hours). If someone plays fewer hours, each person's amount differs. Amounts **rounded to nearest 1000 VND**. Mark **Paid / Unpaid**.
7. **Summary** tab: sums each person's debt, shows remaining balance, marks whole month as paid.

Data stored on device, no account required.

## Pull Members and Votes from Zalo

App doesn't call Zalo directly. Mac logs into Zalo and opens a local network port. **Zalo** tab fetches pinned votes. Calendar and expenses update only when you select a vote and apply it.

### First Time

1. On Mac, in the app directory:

```bash
npm run zalo
```

2. Scan the QR shown (same file at `~/.culong/zalo-qr.png`) with Zalo on your phone, then tap Confirm.
3. Token is in `~/.culong/zalo-bridge.json`. Terminal also prints "Token for app".
4. Terminal prints an address like `http://192.168.1.11:3927`. Mac and iPhone must be on the same Wi-Fi.
5. In app, **Zalo** tab → **Connect Zalo**.
6. Paste host and token → **Save and Get Groups** → select badminton group. If only one group, app selects automatically.

Login cookie stays on Mac (`~/.culong/zalo.json`), not on phone and not in backup files.

### Each Time

**Month**, **Members**, **Courts**, **Summary** tabs don't auto-pull from Zalo. Go to **Zalo** tab → **Load Pinned Votes**. Status line:

- `Zalo · group name · 18:42` — votes just loaded
- `Loading votes`
- `Can't reach Mac` — bridge off, or different Wi-Fi
- `Need QR scan on Mac` — Zalo session expired, run `npm run zalo` and scan again
- `Invalid token` — re-paste token

Each vote has an **Apply to Month** button below its name. Tap it to see diff against the current month open in Month tab. **Apply vote to month** writes changes. **Don't apply** keeps calendar unchanged.

- Only members already linked to Zalo get updated from that day's vote. Manually added people on that day are kept.
- Dates not on calendar won't be added. Dates before today are skipped. Dates in other months aren't written. Switch months in Month tab, then apply again.
- Session already has expenses: diff table shows, but doesn't change people or amounts.
- Names in vote not yet linked: shown in table, don't create members or add to calendar. Link them in **Link to Members**, then review again.
- Anonymous votes and votes without play dates aren't added to calendar.

Other votes aren't touched. To auto-start bridge on Mac login: `zsh tools/zalo-bridge/install-agent.sh`. Log: `~/.culong/zalo-bridge.log`.

Away from home: install Tailscale on Mac and iPhone. **Zalo** tab → **Change Group** and change host to Tailscale IP (`100.x`).

### When Mac is Off

Zalo tab says can't reach Mac. Calendar and members stay unchanged.

**Switching devices:** Month tab → **Backup**.

- Small data: **Export JSON** (copy / AirDrop text). Other device **Import JSON** → Paste JSON.
- Large data (>50KB): export/import via `.json` file.

Import replaces all data on the receiving device.

## Run on iOS

Requires Node 20+ (recommend 24).

### Real Device, No Apple Signing (Expo Go)

SDK 57 on iPhone: must log into the **same Expo account** (free) on Mac and in Expo Go. This is not an Apple Developer account.

1. Create free account: https://expo.dev/signup
2. Install [Expo Go](https://apps.apple.com/app/expo-go/id982107779) from App Store.
3. On Mac:

```bash
cd badminton-expense
nvm use 24
npx expo login
npm start
```

4. In Expo Go: Home tab → avatar icon top-right → log in with **same account**.
5. Mac and iPhone on same Wi-Fi, scan QR.
6. If can't connect, run `npx expo start --tunnel`.

App runs in Expo Go. Closing Metro (`Ctrl+C`) requires `npm start` again to reopen.

Can't do: custom icon on Home Screen, share `.ipa` file. That still requires Apple signing (dev account, free tier lasts 7 days).

### Standalone App on Real Device (no `npm start`)

JS bundled into app. After install, open **Badminton** icon like any app.

iOS **requires signing**. No way to install standalone without this step.

**Cheapest option (free Apple ID, ~7 days then rebuild):**

1. Plug iPhone into Mac, trust device, enable **Developer Mode** (Settings → Privacy).
2. Xcode → Settings → Accounts → add Apple ID (no $99 needed).
3. First time opening Xcode, select Personal team for app if prompted.

```bash
cd badminton-expense
nvm use 24
npm run ios:install
```

This builds Release, installs to iPhone, **no debugger attached**. Closing Xcode app keeps running. Open from **Badminton** icon on Home Screen.

If you press ▶ in Xcode (or `npm run ios:device`), Xcode holds debugger — closing Xcode kills app. Don't open from ▶ if you want standalone usage.

Expires ~7 days: plug in, run `npm run ios:device` again.

**Want durability (TestFlight, no 7-day rebuild):** Apple Developer Program **$99/year**, then `eas build --platform ios` / TestFlight.
