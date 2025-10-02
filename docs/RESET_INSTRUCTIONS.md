# Supabase Reset Cheatsheet

1. Connect to the default postgres database:
   ```bash
   psql "postgresql://postgres:NEWPASSWORD@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require"
   ```

2. Drop and recreate the application database:
   ```sql
   DROP DATABASE IF EXISTS app_db WITH (FORCE);
   CREATE DATABASE app_db;
   \c app_db
   ```

3. Apply migrations:
   ```bash
   psql "postgresql://postgres:NEWPASSWORD@aws-1-eu-west-2.pooler.supabase.com:6543/app_db?sslmode=require" \
     -f db/migrations/001_init.sql
   psql "postgresql://postgres:NEWPASSWORD@aws-1-eu-west-2.pooler.supabase.com:6543/app_db?sslmode=require" \
     -f db/migrations/002_places.sql
   ```

4. Load place boundaries:
   ```bash
   DATABASE_URL="postgresql://postgres:NEWPASSWORD@aws-1-eu-west-2.pooler.supabase.com:6543/app_db?sslmode=require" \
     npm run places:load
   ```

Replace `NEWPASSWORD` with your actual password. If Supabase already uses the default `postgres` database, you can run the migrations directly after dropping tables (`DROP TABLE IF EXISTS ... CASCADE`).
