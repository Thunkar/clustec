-- Convert hex-encoded totalFees and totalManaUsed to decimal strings.
-- Fr.toString() returned hex (0x...), but we need decimal for numeric aggregates.

-- Helper: convert hex string to numeric
CREATE OR REPLACE FUNCTION hex_to_numeric(hex text) RETURNS numeric AS $$
DECLARE
  result numeric := 0;
  i int;
  c text;
  v int;
BEGIN
  IF hex IS NULL OR hex = '' THEN RETURN 0; END IF;
  hex := lower(replace(hex, '0x', ''));
  FOR i IN 1..length(hex) LOOP
    c := substring(hex FROM i FOR 1);
    IF c BETWEEN '0' AND '9' THEN v := ascii(c) - ascii('0');
    ELSIF c BETWEEN 'a' AND 'f' THEN v := ascii(c) - ascii('a') + 10;
    ELSE v := 0;
    END IF;
    result := result * 16 + v;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Convert total_fees
UPDATE blocks
SET total_fees = hex_to_numeric(total_fees)::text
WHERE total_fees LIKE '0x%';

-- Convert total_mana_used
UPDATE blocks
SET total_mana_used = hex_to_numeric(total_mana_used)::text
WHERE total_mana_used LIKE '0x%';

-- Clean up
DROP FUNCTION hex_to_numeric(text);
