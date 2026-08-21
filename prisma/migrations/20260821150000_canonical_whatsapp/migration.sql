-- Celular BR antigo (12 dígitos, 55 + DDD + [6-9]…): insere o 9 depois do DDD.
-- Deduplica allowed_whatsapps e access_requests quando a forma de 13 já existe.

DELETE FROM "allowed_whatsapps" AS short_row
USING "allowed_whatsapps" AS long_row
WHERE short_row.tenant_id = long_row.tenant_id
  AND short_row.id <> long_row.id
  AND short_row.whatsapp ~ '^55[0-9]{10}$'
  AND substring(short_row.whatsapp FROM 5 FOR 1) IN ('6', '7', '8', '9')
  AND long_row.whatsapp = substring(short_row.whatsapp FROM 1 FOR 4) || '9' || substring(short_row.whatsapp FROM 5);

UPDATE "allowed_whatsapps"
SET whatsapp = substring(whatsapp FROM 1 FOR 4) || '9' || substring(whatsapp FROM 5)
WHERE whatsapp ~ '^55[0-9]{10}$'
  AND substring(whatsapp FROM 5 FOR 1) IN ('6', '7', '8', '9');

DELETE FROM "access_requests" AS short_row
USING "access_requests" AS long_row
WHERE short_row.tenant_id = long_row.tenant_id
  AND short_row.id <> long_row.id
  AND short_row.whatsapp ~ '^55[0-9]{10}$'
  AND substring(short_row.whatsapp FROM 5 FOR 1) IN ('6', '7', '8', '9')
  AND long_row.whatsapp = substring(short_row.whatsapp FROM 1 FOR 4) || '9' || substring(short_row.whatsapp FROM 5);

UPDATE "access_requests"
SET whatsapp = substring(whatsapp FROM 1 FOR 4) || '9' || substring(whatsapp FROM 5)
WHERE whatsapp ~ '^55[0-9]{10}$'
  AND substring(whatsapp FROM 5 FOR 1) IN ('6', '7', '8', '9');

UPDATE "users" AS u
SET whatsapp = substring(u.whatsapp FROM 1 FOR 4) || '9' || substring(u.whatsapp FROM 5)
WHERE u.whatsapp ~ '^55[0-9]{10}$'
  AND substring(u.whatsapp FROM 5 FOR 1) IN ('6', '7', '8', '9')
  AND NOT EXISTS (
    SELECT 1
    FROM "users" AS other
    WHERE other.tenant_id = u.tenant_id
      AND other.id <> u.id
      AND other.deleted_at IS NULL
      AND other.whatsapp = substring(u.whatsapp FROM 1 FOR 4) || '9' || substring(u.whatsapp FROM 5)
  );
