import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';
import dataSource from '../config/typeorm.config';
import { AdminUser, AdminRole } from '../modules/admin/entities/admin-user.entity';

config();

async function seed() {
  // Schema is created by the baseline migration (`npm run migration:run`),
  // never by synchronize().
  await dataSource.initialize();
  const repo = dataSource.getRepository(AdminUser);

  const email = process.env.ADMIN_SEED_EMAIL || 'admin@fortune.co.ke';
  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists. Skipping.`);
    await dataSource.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD || 'ChangeMe123!', 10);

  const admin = repo.create({
    email,
    fullName: process.env.ADMIN_SEED_NAME || 'System Administrator',
    passwordHash,
    role: AdminRole.SUPER_ADMIN,
    active: true,
  });

  await repo.save(admin);
  console.log(`Created admin user: ${email}`);
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Failed to seed admin user:', err);
  process.exit(1);
});
