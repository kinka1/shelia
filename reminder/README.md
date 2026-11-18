# Phoenix Telegram reminder

Posts the attendance table (✅/❌ per person, per platform) and nudges to one Telegram channel.
Runs on the VPS as `phoenix-reminder`, reachable only through Phoenix at `/remind-api/`.
No runtime dependencies. Tests: `node --test "reminder/**/*.test.ts"` (Node 24+).

## One-time setup (about 5 minutes)

1. **Create the bot.** In Telegram, open **@BotFather** → `/newbot` → pick a name and a username.
   BotFather replies with the **bot token**. Keep it private; it only goes into `reminder.env` below.
2. **Create the channel** (or use an existing one) and invite your friends.
3. **Add the bot as an admin** of the channel: Channel → Administrators → Add admin → your bot.
   It needs only **Post messages** and **Edit messages of others**.
4. **Get the channel's chat id:**
   - public channel: `@yourchannelname` works as the chat id;
   - private channel: post any message in the channel, then open
     `https://api.telegram.org/bot<TOKEN>/getUpdates` in your browser and copy `chat.id` (it starts with `-100`).
5. **Write the settings file on the VPS** (only you type the values; they never go into git):

   ```sh
   ssh -i ~/.ssh/ssh-key-2025-09-05.key ubuntu@213.35.109.129
   bash
   install -m 600 /dev/null /home/Documents/phoenix/reminder.env
   nano /home/Documents/phoenix/reminder.env
   ```

   with these lines:

   ```
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_CHAT_ID=
   ACCESS_TEAM=spring-haze-8848
   ACCESS_AUD=
   ADMIN_EMAILS=
   TELEGRAM_INVITE_URL=
   ```

   - `ACCESS_AUD`: Cloudflare Zero Trust → Access → Applications → **phoenix** → Overview → *Application Audience (AUD) Tag*.
   - `ADMIN_EMAILS`: your own Access login email (comma-separate several). Admins get the "Libur hari ini" switch.
   - `TELEGRAM_INVITE_URL` (optional): the channel's invite link (`https://t.me/...`). Phoenix shows "Buka channel" and "Salin link".
     Kept here, not in the repo, because the repo is public.
6. From the repo on your Mac, run `./deploy.sh`. It starts `phoenix-reminder` once `reminder.env` exists.

## Schedule (WIB, Monday–Friday)

| Time | Post |
|---|---|
| 07:45 | Masuk table (edited live; ⏳ = not yet, ✅ = done) |
| 07:55, 08:00 | Nudge: Shelia masuk not done |
| 16:45 | Pulang table: Shelia pulang (info) + MagangHub log (edited live) |
| 17:30, 20:00, 22:00, 23:00 | Nudge: MagangHub log not sent |
| 23:30 | Same nudge, silent |
| 23:59:59 | Final result, silent; still-open ⏳ become ❌, in the live tables too |

## Data

SQLite at `/data/reminder.db` (Docker volume `phoenix_reminder-data`): names, platforms, daily ✅/❌,
posted message ids, holidays. History is kept. No tokens, passwords, log text or coordinates.
