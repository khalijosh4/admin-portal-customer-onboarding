import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminUser, AdminRole } from './entities/admin-user.entity';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUser) private readonly repo: Repository<AdminUser>,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.repo.findOne({ where: { email, active: true } });
    if (!admin) throw new UnauthorizedException('Invalid email or password');

    const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Invalid email or password');

    admin.lastLoginAt = new Date();
    await this.repo.save(admin);

    const token = this.jwt.sign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
    });

    return {
      accessToken: token,
      admin: {
        id: admin.id,
        email: admin.email,
        phone: admin.phone,
        fullName: admin.fullName,
        role: admin.role,
        mustChangePassword: admin.mustChangePassword,
        lastLoginAt: admin.lastLoginAt,
      },
    };
  }

  private signToken(admin: AdminUser) {
    return this.jwt.sign({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
    });
  }

  // ---------- admin user management ----------

  async assertSuperAdmin(adminId: string) {
    const admin = await this.repo.findOne({ where: { id: adminId } });
    if (!admin || admin.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admins can manage portal users');
    }
    return admin;
  }

  listUsers() {
    return this.repo.find({
      select: ['id', 'email', 'phone', 'fullName', 'role', 'active', 'createdAt', 'updatedAt'],
      order: { createdAt: 'ASC' },
    });
  }

  async createUser(createdByAdminId: string, data: { email: string; phone?: string; fullName: string; password: string; role?: AdminRole }) {
    await this.assertSuperAdmin(createdByAdminId);

    const email = data.email.trim().toLowerCase();
    const existing = await this.repo.findOne({ where: { email } });
    if (existing) throw new NotFoundException('A user with that email already exists');

    const user = this.repo.create({
      email,
      phone: data.phone?.trim() || undefined,
      fullName: data.fullName.trim(),
      passwordHash: await bcrypt.hash(data.password, 10),
      role: data.role || AdminRole.REVIEWER,
      mustChangePassword: true,
    });
    const saved = await this.repo.save(user);
    const { passwordHash, ...safe } = saved;
    return safe;
  }

  async resetPassword(requestingAdminId: string, userId: string, newPassword: string) {
    await this.assertSuperAdmin(requestingAdminId);
    const user = await this.repo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = true;
    await this.repo.save(user);
    return { ok: true };
  }

  async setActive(requestingAdminId: string, userId: string, active: boolean) {
    const requesting = await this.assertSuperAdmin(requestingAdminId);
    if (requesting.id === userId && !active) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const user = await this.repo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.active = active;
    await this.repo.save(user);
    return { ok: true };
  }

  // ---------- own profile ----------

  async getProfile(adminId: string) {
    const admin = await this.repo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('User not found');
    return {
      id: admin.id,
      email: admin.email,
      phone: admin.phone,
      fullName: admin.fullName,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }

  async updateProfile(adminId: string, data: { email?: string; phone?: string; fullName?: string }) {
    const admin = await this.repo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('User not found');

    if (data.fullName !== undefined) admin.fullName = data.fullName.trim() || admin.fullName;
    if (data.phone !== undefined) admin.phone = data.phone?.trim() || null;
    if (data.email !== undefined) {
      const email = data.email.trim().toLowerCase();
      if (email && email !== admin.email) {
        const existing = await this.repo.findOne({ where: { email } });
        if (existing && existing.id !== admin.id) {
          throw new NotFoundException('A user with that email already exists');
        }
        admin.email = email;
      }
    }

    const saved = await this.repo.save(admin);
    return {
      id: saved.id,
      email: saved.email,
      phone: saved.phone,
      fullName: saved.fullName,
      role: saved.role,
      mustChangePassword: saved.mustChangePassword,
      lastLoginAt: saved.lastLoginAt,
    };
  }

  async changeOwnPassword(adminId: string, currentPassword: string, newPassword: string, forced = false) {
    const admin = await this.repo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('User not found');

    if (!forced) {
      const currentMatches = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!currentMatches) throw new ForbiddenException('Current password is incorrect');
    }

    admin.passwordHash = await bcrypt.hash(newPassword, 10);
    admin.mustChangePassword = false;
    const saved = await this.repo.save(admin);

    return {
      accessToken: this.signToken(saved),
      admin: {
        id: saved.id,
        email: saved.email,
        phone: saved.phone,
        fullName: saved.fullName,
        role: saved.role,
        mustChangePassword: saved.mustChangePassword,
        lastLoginAt: saved.lastLoginAt,
      },
    };
  }
}
