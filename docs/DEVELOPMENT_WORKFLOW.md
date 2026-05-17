# Churchill Development Workflow

## Rules

* Never edit production database directly first
* Always create migration files first
* Test locally with `supabase db reset`
* Commit migrations to Git
* Verify locally before deployment
* Use local Supabase for development
* Production changes must be reproducible

## Standard Workflow

1. Create migration
2. Apply locally
3. Test locally
4. Reset database
5. Verify rebuild
6. Commit to Git
7. Push to repository
8. Deploy safely

## Commands

### Start local stack

```bash
supabase start
```

### Reset local database

```bash
supabase db reset
```

### Create migration

```bash
supabase migration new migration_name
```

### Stop local stack
bash
supabase stop


## Environment Rules

* `.env.local` = production/staging
* `.env.development.local` = local development
* Never commit secrets
* Never commit backups

## Recovery

Full schema backup stored in:

text
backups/schema_public_backup.sql
