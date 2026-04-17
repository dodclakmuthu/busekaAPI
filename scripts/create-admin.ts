/**
 * Creates (or promotes) an APP_ADMIN account.
 *
 * Usage:
 *   node --require ts-node/register scripts/create-admin.ts \
 *     --name "Super Admin" \
 *     --mobile "0712345678" \
 *     --password "changeme123"
 *
 * Or promote an existing user:
 *   node --require ts-node/register scripts/create-admin.ts \
 *     --mobile "0712345678" --promote
 */

import { config as loadEnv } from 'dotenv';
import { PrismaClient, UserAccountStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';
import { getAuthMobileLookupVariants, INVALID_SRI_LANKAN_PHONE_MESSAGE, normalizeAuthMobileNumber } from '../src/auth/phone.util';

loadEnv();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

async function main() {
  const mobile = arg('--mobile') ?? await prompt('Mobile number: ');
  const normalizedMobile = normalizeAuthMobileNumber(mobile);
  const promoteOnly = hasFlag('--promote');

  if (!normalizedMobile) {
    console.error(INVALID_SRI_LANKAN_PHONE_MESSAGE);
    process.exit(1);
  }

  if (promoteOnly) {
    // Just set isAppAdmin = true on an existing user
    const user = await prisma.user.findFirst({
      where: { mobileNumber: { in: getAuthMobileLookupVariants(mobile) } },
    });
    if (!user) {
      console.error(`No user found with mobile: ${mobile}`);
      process.exit(1);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isAppAdmin: true,
        mobileNumber: normalizedMobile,
        status: UserAccountStatus.ACTIVE,
        isMobileVerified: true,
        mobileVerifiedAt: user.mobileVerifiedAt ?? new Date(),
        isActive: true,
      },
    });
    console.log(`✅  Promoted "${user.fullName}" (${normalizedMobile}) to APP_ADMIN`);
    return;
  }

  // Create new admin account
  const fullName = arg('--name') ?? await prompt('Full name: ');
  const password = arg('--password') ?? await prompt('Password (min 6 chars): ');

  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({
    where: { mobileNumber: { in: getAuthMobileLookupVariants(mobile) } },
  });
  if (existing) {
    console.error(`A user with mobile ${normalizedMobile} already exists. Use --promote to grant admin access.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      fullName,
      mobileNumber: normalizedMobile,
      passwordHash,
      status: UserAccountStatus.ACTIVE,
      isMobileVerified: true,
      mobileVerifiedAt: new Date(),
      isActive: true,
      isAppAdmin: true,
    },
  });

  console.log(`✅  APP_ADMIN account created:`);
  console.log(`    Name   : ${user.fullName}`);
  console.log(`    Mobile : ${user.mobileNumber}`);
  console.log(`    ID     : ${user.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
