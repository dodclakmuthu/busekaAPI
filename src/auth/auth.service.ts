import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtPayload, SafeUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private toSafeUser(user: {
    id: string;
    fullName: string;
    mobileNumber: string;
    email: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      fullName: user.fullName,
      mobileNumber: user.mobileNumber,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async signup(dto: SignupDto): Promise<{ user: SafeUser }> {
    const existingByMobile = await this.prisma.user.findUnique({
      where: { mobileNumber: dto.mobileNumber },
      select: { id: true },
    });

    if (existingByMobile) {
      throw new ConflictException({
        message: 'Mobile number already registered',
      });
    }

    if (dto.email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (existingByEmail) {
        throw new ConflictException({
          message: 'Email already registered',
        });
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        mobileNumber: dto.mobileNumber,
        email: dto.email ?? null,
        passwordHash,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        mobileNumber: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { user: this.toSafeUser(user) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: SafeUser }> {
    const user = await this.prisma.user.findUnique({
      where: { mobileNumber: dto.mobileNumber },
      select: {
        id: true,
        fullName: true,
        mobileNumber: true,
        email: true,
        passwordHash: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ message: 'Invalid credentials' });
    }

    const payload: JwtPayload = { sub: user.id, mobileNumber: user.mobileNumber };
    const accessToken = await this.jwt.signAsync(payload);

    const { passwordHash: _ph, ...safe } = user;
    return { accessToken, user: this.toSafeUser(safe) };
  }

  async getUserByIdOrThrow(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        mobileNumber: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }

    return this.toSafeUser(user);
  }
}
