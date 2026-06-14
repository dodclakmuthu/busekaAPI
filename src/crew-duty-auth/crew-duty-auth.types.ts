export type CrewDutyJwtPayload = {
  /** Distinguish crew-duty tokens from dashboard/user tokens. */
  typ: 'crew-duty';

  /** Subject format prevents accidental collision with user IDs. */
  sub: `bus:${string}`;

  busId: string;
  companyId: string;
  registrationNumber: string;
  sessionId?: string;
};

export type CrewDutySession = {
  busId: string;
  companyId: string;
  registrationNumber: string;
  sessionId?: string;
};
