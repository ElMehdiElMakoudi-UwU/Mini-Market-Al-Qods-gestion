// Runs at container start: applies pending migrations, then creates the
// owner account from OWNER_USERNAME / OWNER_PASSWORD if no user exists yet.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
console.log("Migrations applied");

const [{ count }] = await sql`select count(*)::int as count from users`;
if (count === 0) {
  const username = process.env.OWNER_USERNAME || "admin";
  const password = process.env.OWNER_PASSWORD;
  if (!password) {
    console.error("No users yet: set OWNER_PASSWORD to create the owner account.");
  } else {
    const hash = await bcrypt.hash(password, 10);
    await sql`insert into users (name, username, password_hash, role)
              values (${process.env.OWNER_NAME || "Propriétaire"}, ${username}, ${hash}, 'OWNER')`;
    console.log(`Owner account "${username}" created`);
  }
}
await sql.end();
