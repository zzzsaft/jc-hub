DELETE FROM "production_config_agent"."contract_archive_item_products"
WHERE "archive_id" IN (
  WITH ranked AS (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "document_id"
        ORDER BY
          CASE WHEN "status" = 'archived' AND "dirty_reason" IS NULL THEN 0 ELSE 1 END,
          "updated_at" DESC,
          "id" ASC
      ) AS keep_rank
    FROM "production_config_agent"."contract_archives"
    WHERE "document_id" IN (
      SELECT "document_id"
      FROM "production_config_agent"."contract_archives"
      WHERE "document_id" IS NOT NULL
      GROUP BY "document_id"
      HAVING count(*) > 1
    )
  )
  SELECT "id" FROM ranked WHERE keep_rank > 1
);

DELETE FROM "production_config_agent"."contract_archive_versions"
WHERE "archive_id" IN (
  WITH ranked AS (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "document_id"
        ORDER BY
          CASE WHEN "status" = 'archived' AND "dirty_reason" IS NULL THEN 0 ELSE 1 END,
          "updated_at" DESC,
          "id" ASC
      ) AS keep_rank
    FROM "production_config_agent"."contract_archives"
    WHERE "document_id" IN (
      SELECT "document_id"
      FROM "production_config_agent"."contract_archives"
      WHERE "document_id" IS NOT NULL
      GROUP BY "document_id"
      HAVING count(*) > 1
    )
  )
  SELECT "id" FROM ranked WHERE keep_rank > 1
);

DELETE FROM "production_config_agent"."contract_archive_items"
WHERE "archive_id" IN (
  WITH ranked AS (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "document_id"
        ORDER BY
          CASE WHEN "status" = 'archived' AND "dirty_reason" IS NULL THEN 0 ELSE 1 END,
          "updated_at" DESC,
          "id" ASC
      ) AS keep_rank
    FROM "production_config_agent"."contract_archives"
    WHERE "document_id" IN (
      SELECT "document_id"
      FROM "production_config_agent"."contract_archives"
      WHERE "document_id" IS NOT NULL
      GROUP BY "document_id"
      HAVING count(*) > 1
    )
  )
  SELECT "id" FROM ranked WHERE keep_rank > 1
);

DELETE FROM "production_config_agent"."contract_archives"
WHERE "id" IN (
  WITH ranked AS (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "document_id"
        ORDER BY
          CASE WHEN "status" = 'archived' AND "dirty_reason" IS NULL THEN 0 ELSE 1 END,
          "updated_at" DESC,
          "id" ASC
      ) AS keep_rank
    FROM "production_config_agent"."contract_archives"
    WHERE "document_id" IN (
      SELECT "document_id"
      FROM "production_config_agent"."contract_archives"
      WHERE "document_id" IS NOT NULL
      GROUP BY "document_id"
      HAVING count(*) > 1
    )
  )
  SELECT "id" FROM ranked WHERE keep_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "contract_archives_document_id_unique_not_null"
  ON "production_config_agent"."contract_archives" ("document_id")
  WHERE "document_id" IS NOT NULL;
