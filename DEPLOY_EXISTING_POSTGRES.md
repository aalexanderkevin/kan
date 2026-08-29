# Deploy Kan with an existing PostgreSQL container

This deployment runs only Kan's `migrate` and `web` containers. It reuses a
PostgreSQL container named `postgres` through a dedicated Docker network.

## One-time server setup

Create a separate network and attach the existing database container:

```sh
docker network create kan-network
docker network connect kan-network postgres
```

Create an isolated database and role for Kan. Run this with a PostgreSQL
superuser; do not reuse the HRIS database or its application user.

```sh
docker exec -it postgres psql -U postgres -d postgres
```

```sql
CREATE USER kan WITH PASSWORD 'use-a-long-random-password';
CREATE DATABASE kan_db OWNER kan;
GRANT ALL PRIVILEGES ON DATABASE kan_db TO kan;
```

If the database container uses a different superuser, replace `postgres` in
the `psql` command with that user.

## Configure and deploy

Copy the environment template and fill in real values:

```sh
cp .env.server.example .env.server
chmod 600 .env.server
```

Set `POSTGRES_URL` to use `postgres` as the hostname and set
`NEXT_PUBLIC_BASE_URL` to the final public HTTPS URL. Configure the S3 values
to enable avatar, card, and comment file uploads.

Build and start the application:

```sh
docker compose -f docker-compose.existing-postgres.yml up --build -d
```

Confirm the one-off migration completed before using the app:

```sh
docker compose -f docker-compose.existing-postgres.yml logs migrate
docker compose -f docker-compose.existing-postgres.yml ps
```

Kan listens on `127.0.0.1:3000` by default. Set `KAN_WEB_PORT` in the shell
before starting Compose if that host port is occupied. Put a reverse proxy with
TLS in front of the port for public access; the application port is not exposed
directly to the internet.

## Updating Kan

After pulling source changes, run migrations before recreating the web service:

```sh
docker compose -f docker-compose.existing-postgres.yml up --build --force-recreate migrate
docker compose -f docker-compose.existing-postgres.yml up -d --build --force-recreate --no-deps web
```
