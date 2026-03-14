export type SafeUser = {
  id: string;
  fullName: string;
  mobileNumber: string;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type JwtPayload = {
  sub: string;
  mobileNumber: string;
};
