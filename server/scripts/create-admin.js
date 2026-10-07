// Creates the first admin login on a fresh database.
// Usage (from server/):  npm run create-admin
//
// Safe to re-run: it never deletes anything, reuses the "Admin" role if it
// exists, and refuses to touch a username or email that is already taken.
require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const ROLE_NAME = "Admin";
const prisma = new PrismaClient();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
let muted = false;
// While muted, readline's echo is suppressed so the typed password stays hidden.
const writeToOutput = rl._writeToOutput.bind(rl);
rl._writeToOutput = (text) => {
  if (!muted) writeToOutput(text);
};

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  if (done) throw new Error("Input ended before all answers were given. Nothing changed.");
  return value.trim();
}

async function main() {
  const username = (await ask("Username: ")).toLowerCase();
  const fullName = await ask("Full name: ");
  const email = (await ask("Email: ")).toLowerCase();
  const password = await ask("Password (min 8 chars): ", { hidden: true });
  const confirm = await ask("Confirm password: ", { hidden: true });

  if (!username || !fullName || !email) throw new Error("Username, full name and email are required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (password !== confirm) throw new Error("Passwords do not match.");

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true, email: true },
  });
  if (existing) {
    throw new Error(`A user already exists with that username or email (${existing.username} / ${existing.email}). Nothing changed.`);
  }

  const role = await prisma.role.upsert({
    where: { name: ROLE_NAME },
    update: {},
    create: { name: ROLE_NAME, description: "System administrator" },
  });
  if (!role.isActive) throw new Error(`Role "${ROLE_NAME}" exists but is inactive. Reactivate it first.`);

  const user = await prisma.user.create({
    data: {
      username,
      fullName,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      roleId: role.id,
    },
    select: { id: true, username: true, email: true },
  });

  console.log(`Created admin user #${user.id}: ${user.username} <${user.email}> with role "${ROLE_NAME}".`);
}

main()
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
    return prisma.$disconnect();
  });
