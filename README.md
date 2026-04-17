# Nest Hello World

Minimal NestJS backend with a single `GET /` route.

## Run

## Environment (.env)

- Copy `.env.example` to `.env`.
- Supported variables:
	- `PORT` (defaults to `3000`)
	- `JWT_ACCESS_SECRET`
	- `JWT_ACCESS_TTL_SECONDS`
	- `TEXTLK_API_TOKEN`
	- `TEXTLK_SENDER_ID`
	- `TEXTLK_SMS_ENDPOINT`

`TEXTLK_API_TOKEN` is required in production for OTP delivery. In non-production, if it is missing, the backend logs the OTP code instead of sending SMS so the signup flow remains testable locally.

```bash
cd backend
npm install
npm run start:dev
```

Then open:
- http://localhost:3000/ → `Hello World!`


## migrations
```
npx prisma migrate dev --name init
npx prisma generate
```

### create admin portal account
`npm run create-admin -- --mobile 0771045601 --name "Admin" --password "Test.123"`