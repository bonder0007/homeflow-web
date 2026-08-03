# HomeFlow Web

אפליקציה ביתית לניהול תזרים חודשי, הוצאות קבועות ומזדמנות, תקציבים וניתוחים.

## הרצה מקומית

1. העתיקו את `.env.example` אל `.env.local` והשלימו את הערכים.
2. הפעילו PostgreSQL והגדירו `DATABASE_URL`.
3. הריצו `npm install`, לאחר מכן `npm run db:migrate`, ולבסוף `npm run dev`.

## Google OAuth

יש ליצור OAuth Web Client ב-Google Cloud ולהגדיר את כתובת החזרה:

`https://YOUR-DOMAIN/api/auth/callback/google`

הגישה נקבעת לפי `ALLOWED_EMAILS`, ללא תלות באותיות גדולות או קטנות.

## Railway

- הוסיפו PostgreSQL לפרויקט.
- הגדירו את משתני הסביבה מתוך `.env.example`.
- Build command: `npm run build`
- Pre-deploy command: `npm run db:migrate`
- Start command: `npm start`
