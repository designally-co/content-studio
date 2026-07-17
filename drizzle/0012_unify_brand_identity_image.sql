UPDATE "brand_profiles"
SET
  "logo_data" = "profile_image_data",
  "logo_mime" = "profile_image_mime"
WHERE
  "logo_data" = ''
  AND "profile_image_data" <> '';
