INSERT INTO `timeline_clock` (
  `id`,
  `owner_ordinal`,
  `public_ordinal`,
  `public_privacy_epoch`,
  `updated_at`
) VALUES (
  1,
  0,
  0,
  0,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);
