// Sets the owner's password to OWNER_PASSWORD (creating the account if missing)
// and signs out their existing sessions. Use it if the owner password is lost.
import postgres from "postgres";
import bcrypt from "bcryptjs";

const username = (process.env.OWNER_USERNAME || "admin").toLowerCase();
const password = process.env.OWNER_PASSWORD;
if (!password || password.length < 4) {
  console.error("Set OWNER_PASSWORD (at least 4 characters).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const hash = await bcrypt.hash(password, 10);
const [user] = await sql`
  insert into users (name, username, password_hash, role)
  values (${process.env.OWNER_NAME || "Propriétaire"}, ${username}, ${hash}, 'OWNER')
  on conflict (username) do update set password_hash = excluded.password_hash, role = 'OWNER', active = true
  returning id`;
await sql`delete from sessions where user_id = ${user.id}`;
console.log(`Password reset for owner "${username}"`);
await sql.end();
