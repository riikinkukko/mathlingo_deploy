-- Run only against a freshly created disposable PostgreSQL database.
-- Set permit_token via psql -v. The stock Docker test role can read pg_control_system().
SELECT pg_catalog.format('COMMENT ON DATABASE %I IS %L', d.datname,
         pg_catalog.concat('planimetrika:seed-reset:v2:', :'permit_token', ':',
           (pg_catalog.pg_control_system()).system_identifier, ':',
           EXTRACT(EPOCH FROM pg_catalog.pg_postmaster_start_time()), ':', d.oid))
FROM pg_catalog.pg_database AS d
WHERE d.datname = pg_catalog.current_database()
  AND d.datname ~ '^seed_reset_test_[a-f0-9]{32}$'
  AND :'permit_token' ~ '^[a-f0-9]{32}$'
\gexec
