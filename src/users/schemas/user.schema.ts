import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
class LoginHistoryEntry {
  @Prop({ required: true })
  timestamp: Date;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;
}

/**
 * The single source of truth for what a "user" is in this system.
 * `@Schema({ timestamps: true })` asks Mongoose to manage `createdAt` /
 * `updatedAt` automatically — one less thing that can be forgotten or set
 * inconsistently by hand. Fields never meant to leave the server
 * (password, token hashes) are stripped in the `toJSON` transform below,
 * so even a careless `return user` from a controller can't leak them.
 */
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  // `unique: true` creates a unique index at the DB level — the real
  // guarantee against duplicate emails, since app-level "check then insert"
  // checks are always racy under concurrent requests.
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop()
  phoneNumber?: string;

  @Prop()
  avatar?: string;

  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  // Never store a raw refresh token — only its SHA-256 hash (see
  // common/utils/crypto.util.ts). `select: false` keeps it out of normal
  // queries so it's never accidentally serialized or logged.
  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop({ select: false })
  passwordResetTokenHash?: string;

  @Prop({ select: false })
  passwordResetExpires?: Date;

  @Prop({ select: false })
  emailVerificationTokenHash?: string;

  @Prop({ select: false })
  emailVerificationExpires?: Date;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockUntil?: Date;

  @Prop()
  lastLogin?: Date;

  @Prop({ default: 0 })
  loginCount: number;

  @Prop({ type: [LoginHistoryEntry], default: [] })
  loginHistory: LoginHistoryEntry[];

  // Soft delete: rows are never physically removed, only flagged. This
  // preserves referential integrity/audit trails and lets a deletion be
  // undone; every query in UsersService must filter `isDeleted: false`.
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ isDeleted: 1 });

UserSchema.set('toJSON', {
  virtuals: true,
  transform: ((_doc: unknown, ret: Record<string, unknown>) => {
    delete ret.password;
    delete ret.refreshTokenHash;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpires;
    delete ret.emailVerificationTokenHash;
    delete ret.emailVerificationExpires;
    delete ret.__v;
    return ret;
  }) as unknown as (doc: unknown, ret: unknown, options: unknown) => unknown,
});
