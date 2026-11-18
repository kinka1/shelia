import { DatabaseSync } from 'node:sqlite'
import type { Row } from './render.ts'
import type { Slot } from './schedule.ts'

export type Person = { email: string; sheliaName: string | null; shelia: boolean; maganghub: boolean }
export type PersonPatch = { sheliaName?: string; shelia?: boolean; maganghub?: boolean }
export type Flags = { masuk?: boolean; pulang?: boolean; log?: boolean }
export type Store = ReturnType<typeof openStore>

/** Name shown in the channel: Shelia first name, else the email's local part (MagangHub tokens carry no name). */
export const nameOf = (p: { email: string; sheliaName: string | null }) =>
  (p.sheliaName ? p.sheliaName.trim().split(/\s+/)[0] : '') || p.email.split('@')[0]

/** Everything is kept (no automatic deletion). No tokens, log text or coordinates are ever stored. */
export function openStore(path: string) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS people (email TEXT PRIMARY KEY, nick TEXT, shelia_name TEXT, shelia INTEGER NOT NULL DEFAULT 0, maganghub INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS done (email TEXT NOT NULL, date TEXT NOT NULL, masuk INTEGER NOT NULL DEFAULT 0, pulang INTEGER NOT NULL DEFAULT 0, log INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (email, date));
    CREATE TABLE IF NOT EXISTS fired (date TEXT NOT NULL, event TEXT NOT NULL, PRIMARY KEY (date, event));
    CREATE TABLE IF NOT EXISTS messages (date TEXT NOT NULL, slot TEXT NOT NULL, message_id INTEGER NOT NULL, PRIMARY KEY (date, slot));
    CREATE TABLE IF NOT EXISTS holidays (date TEXT PRIMARY KEY);
  `)
  const b = (v: boolean | undefined) => (v === undefined ? null : v ? 1 : 0)
  const q = {
    insert: db.prepare('INSERT OR IGNORE INTO people (email) VALUES (?)'),
    // ponytail: the nick column from the first version stays in the schema, unused.
    patch: db.prepare(`UPDATE people SET
      shelia_name = COALESCE(:sheliaName, shelia_name),
      shelia = COALESCE(:shelia, shelia),
      maganghub = COALESCE(:maganghub, maganghub) WHERE email = :email`),
    person: db.prepare('SELECT email, shelia_name, shelia, maganghub FROM people WHERE email = ?'),
    done: db.prepare(`INSERT INTO done (email, date, masuk, pulang, log) VALUES (:email, :date, :masuk, :pulang, :log)
      ON CONFLICT (email, date) DO UPDATE SET masuk = max(masuk, :masuk), pulang = max(pulang, :pulang), log = max(log, :log)`),
    roster: db.prepare(`SELECT p.email, p.shelia_name, p.shelia, p.maganghub,
      COALESCE(d.masuk, 0) masuk, COALESCE(d.pulang, 0) pulang, COALESCE(d.log, 0) log
      FROM people p LEFT JOIN done d ON d.email = p.email AND d.date = ? WHERE p.shelia = 1 OR p.maganghub = 1`),
    fired: db.prepare('SELECT 1 FROM fired WHERE date = ? AND event = ?'),
    markFired: db.prepare('INSERT OR IGNORE INTO fired (date, event) VALUES (?, ?)'),
    getMsg: db.prepare('SELECT message_id FROM messages WHERE date = ? AND slot = ?'),
    setMsg: db.prepare('INSERT OR REPLACE INTO messages (date, slot, message_id) VALUES (?, ?, ?)'),
    isHoliday: db.prepare('SELECT 1 FROM holidays WHERE date = ?'),
    addHoliday: db.prepare('INSERT OR IGNORE INTO holidays (date) VALUES (?)'),
    delHoliday: db.prepare('DELETE FROM holidays WHERE date = ?'),
  }
  const displayName = (r: any) => nameOf({ email: r.email, sheliaName: r.shelia_name })

  return {
    patchPerson(email: string, p: PersonPatch): void {
      q.insert.run(email)
      q.patch.run({ email, sheliaName: p.sheliaName ?? null, shelia: b(p.shelia), maganghub: b(p.maganghub) })
    },
    getPerson(email: string): Person | null {
      const r: any = q.person.get(email)
      return r ? { email: r.email, sheliaName: r.shelia_name, shelia: !!r.shelia, maganghub: !!r.maganghub } : null
    },
    markDone(email: string, date: string, f: Flags): void {
      q.done.run({ email, date, masuk: f.masuk ? 1 : 0, pulang: f.pulang ? 1 : 0, log: f.log ? 1 : 0 })
    },
    roster(date: string): (Row & { email: string })[] {
      return (q.roster.all(date) as any[])
        .map((r) => ({ email: r.email, name: displayName(r), shelia: !!r.shelia, maganghub: !!r.maganghub, masuk: !!r.masuk, pulang: !!r.pulang, log: !!r.log }))
        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    },
    fired: (date: string, event: string) => !!q.fired.get(date, event),
    markFired: (date: string, event: string) => void q.markFired.run(date, event),
    getMessage: (date: string, slot: Slot) => ((q.getMsg.get(date, slot) as any)?.message_id ?? null) as number | null,
    setMessage: (date: string, slot: Slot, id: number) => void q.setMsg.run(date, slot, id),
    isHoliday: (date: string) => !!q.isHoliday.get(date),
    setHoliday: (date: string, on: boolean) => void (on ? q.addHoliday : q.delHoliday).run(date),
    close: () => db.close(),
  }
}
