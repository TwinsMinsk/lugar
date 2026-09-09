-- The `brand.materialLogos` setting is gone from the registry: brand logos are
-- per-brand slots on the materials block now, chosen with the same picker as
-- every other image, so a free-text setting describing them had nothing to do.
--
-- The row has to go with it. `pendingReview` counts every settings row flagged
-- `needs_review`, whatever the registry says, so an orphan left behind would
-- keep the amber "settings are waiting for values" banner up on every admin
-- screen with no field anywhere to satisfy it.
DELETE FROM "site_settings" WHERE "key" = 'brand.materialLogos';
