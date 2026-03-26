-- Enum for appearance roles
CREATE TYPE "address_appearance_role" AS ENUM ('msgSender', 'calldata', 'l2ToL1Recipient', 'l2ToL1Sender');

-- Reverse index: address → tx_id with role
CREATE TABLE "public_address_appearances" (
  "id" SERIAL PRIMARY KEY,
  "tx_id" INTEGER NOT NULL REFERENCES "transactions"("id"),
  "address" TEXT NOT NULL,
  "role" "address_appearance_role" NOT NULL
);

CREATE INDEX "paa_address_idx" ON "public_address_appearances" ("address");
CREATE INDEX "paa_tx_idx" ON "public_address_appearances" ("tx_id");
CREATE UNIQUE INDEX "paa_unique" ON "public_address_appearances" ("tx_id", "address", "role");

-- Backfill msgSender from publicCalls
INSERT INTO "public_address_appearances" ("tx_id", "address", "role")
SELECT DISTINCT t.id, lower(elem->>'msgSender'), 'msgSender'::"address_appearance_role"
FROM "transactions" t,
     jsonb_array_elements(t."public_calls") AS elem
WHERE elem->>'msgSender' IS NOT NULL
  AND elem->>'msgSender' != ''
  AND lower(elem->>'msgSender') != '0x0000000000000000000000000000000000000000000000000000000000000000'
ON CONFLICT ("tx_id", "address", "role") DO NOTHING;

-- Backfill calldata (all 66-char hex values)
INSERT INTO "public_address_appearances" ("tx_id", "address", "role")
SELECT DISTINCT t.id, lower(cd.value), 'calldata'::"address_appearance_role"
FROM "transactions" t,
     jsonb_array_elements(t."public_calls") AS elem,
     jsonb_array_elements_text(elem->'calldata') AS cd(value)
WHERE cd.value IS NOT NULL
  AND length(cd.value) = 66
  AND lower(cd.value) != '0x0000000000000000000000000000000000000000000000000000000000000000'
ON CONFLICT ("tx_id", "address", "role") DO NOTHING;

-- Backfill l2ToL1 recipients
INSERT INTO "public_address_appearances" ("tx_id", "address", "role")
SELECT DISTINCT t.id, lower(msg->>'recipient'), 'l2ToL1Recipient'::"address_appearance_role"
FROM "transactions" t,
     jsonb_array_elements(t."l2_to_l1_msg_details") AS msg
WHERE msg->>'recipient' IS NOT NULL
  AND msg->>'recipient' != ''
  AND lower(msg->>'recipient') != '0x0000000000000000000000000000000000000000000000000000000000000000'
ON CONFLICT ("tx_id", "address", "role") DO NOTHING;

-- Backfill l2ToL1 senderContract
INSERT INTO "public_address_appearances" ("tx_id", "address", "role")
SELECT DISTINCT t.id, lower(msg->>'senderContract'), 'l2ToL1Sender'::"address_appearance_role"
FROM "transactions" t,
     jsonb_array_elements(t."l2_to_l1_msg_details") AS msg
WHERE msg->>'senderContract' IS NOT NULL
  AND msg->>'senderContract' != ''
  AND lower(msg->>'senderContract') != '0x0000000000000000000000000000000000000000000000000000000000000000'
ON CONFLICT ("tx_id", "address", "role") DO NOTHING;
