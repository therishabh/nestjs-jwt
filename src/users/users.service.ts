import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from '../common/enums/role.enum';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildSearchFilter, paginate } from '../common/utils/pagination.util';

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  hashedPassword: string;
  role?: Role;
}

/**
 * The only place in the codebase that talks to the User Mongoose model
 * directly — every other module (Auth, Profile, seed script) goes through
 * this service. This is the Repository pattern: it means the query shape
 * for "find an active, non-deleted user by email" is defined once, and if
 * the soft-delete convention ever changes, one file needs to change instead
 * of every caller that queries users.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    return this.userModel.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase().trim(),
      password: input.hashedPassword,
      role: input.role ?? Role.USER,
    });
  }

  async findActiveById(id: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ _id: id, isDeleted: false }).exec();
  }

  async findActiveByIdOrThrow(id: string): Promise<UserDocument> {
    const user = await this.findActiveById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim(), isDeleted: false })
      .exec();
  }

  /** Auth needs the password hash, refresh-token hash, etc., which are `select: false` by default. */
  async findByEmailWithSecrets(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim(), isDeleted: false })
      .select('+password +refreshTokenHash +failedLoginAttempts +lockUntil')
      .exec();
  }

  async findByIdWithSecrets(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ _id: id, isDeleted: false })
      .select('+password +refreshTokenHash')
      .exec();
  }

  async updateProfile(
    id: string,
    dto: UpdateProfileDto,
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, isDeleted: false },
        { $set: dto },
        { returnDocument: 'after' },
      )
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async recordSuccessfulLogin(
    id: string,
    entry: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: { lastLogin: new Date(), failedLoginAttempts: 0 },
          $unset: { lockUntil: '' },
          $inc: { loginCount: 1 },
          $push: {
            loginHistory: {
              $each: [{ timestamp: new Date(), ...entry }],
              // Keep only the most recent 20 entries — an embedded array
              // that grows forever would bloat every user document.
              $slice: -20,
            },
          },
        },
      )
      .exec();
  }

  async registerFailedLoginAttempt(
    id: string,
    maxAttempts: number,
    lockDurationMinutes: number,
  ): Promise<{ locked: boolean; lockUntil?: Date }> {
    const user = await this.userModel
      .findById(id)
      .select('+failedLoginAttempts')
      .exec();
    if (!user) return { locked: false };

    const attempts = user.failedLoginAttempts + 1;
    const update: Partial<User> = { failedLoginAttempts: attempts };

    if (attempts >= maxAttempts) {
      update.lockUntil = new Date(Date.now() + lockDurationMinutes * 60_000);
    }

    await this.userModel.updateOne({ _id: id }, { $set: update }).exec();
    return { locked: !!update.lockUntil, lockUntil: update.lockUntil };
  }

  async setRefreshTokenHash(
    id: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    // MongoDB's driver silently drops `undefined` values from an update
    // document, so `$set: { refreshTokenHash: undefined }` is a no-op —
    // clearing the field on logout/rotation-mismatch requires `$unset`.
    const update =
      refreshTokenHash === null
        ? { $unset: { refreshTokenHash: '' } }
        : { $set: { refreshTokenHash } };
    await this.userModel.updateOne({ _id: id }, update).exec();
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: { password: hashedPassword },
          $unset: { refreshTokenHash: '' },
        },
      )
      .exec();
  }

  async setPasswordResetToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: expiresAt,
          },
        },
      )
      .exec();
  }

  async findByPasswordResetTokenHash(
    tokenHash: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: { $gt: new Date() },
        isDeleted: false,
      })
      .select('+passwordResetTokenHash +passwordResetExpires')
      .exec();
  }

  async clearPasswordResetToken(id: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        { $unset: { passwordResetTokenHash: '', passwordResetExpires: '' } },
      )
      .exec();
  }

  async setEmailVerificationToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            emailVerificationTokenHash: tokenHash,
            emailVerificationExpires: expiresAt,
          },
        },
      )
      .exec();
  }

  async findByEmailVerificationTokenHash(
    tokenHash: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpires: { $gt: new Date() },
        isDeleted: false,
      })
      .select('+emailVerificationTokenHash +emailVerificationExpires')
      .exec();
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: { isEmailVerified: true },
          $unset: {
            emailVerificationTokenHash: '',
            emailVerificationExpires: '',
          },
        },
      )
      .exec();
  }

  async listUsers(query: PaginationQueryDto) {
    const searchFilter = buildSearchFilter<User>(query.search, [
      'firstName',
      'lastName',
      'email',
    ]);
    return paginate(
      this.userModel,
      { isDeleted: false, ...searchFilter },
      query.page,
      query.limit,
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      )
      .exec();
  }
}
