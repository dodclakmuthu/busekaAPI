# Nest Hello World

Minimal NestJS backend with a single `GET /` route.

## Run

## Environment (.env)

- Copy `.env.example` to `.env`.
- Supported variable: `PORT` (defaults to `3000`).

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