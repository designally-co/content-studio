UPDATE "categories"
SET "active" = false
WHERE "name" IN ('Web Design', 'SEO', 'E-commerce', 'AI Tools', 'Company News');

INSERT INTO "categories" ("name", "name_th", "active")
SELECT values_to_add."name", values_to_add."name_th", true
FROM (
  VALUES
    ('Creative Resources', 'แหล่งข้อมูลสำหรับงานครีเอทีฟ'),
    ('Typography & Fonts', 'ตัวอักษรและฟอนต์'),
    ('UX/UI Resources', 'แหล่งข้อมูล UX/UI'),
    ('Design Principles', 'หลักการออกแบบ'),
    ('AI Tools for Designers', 'เครื่องมือ AI สำหรับนักออกแบบ'),
    ('Branding & Identity', 'แบรนดิ้งและอัตลักษณ์'),
    ('Web Design & Creative Technology', 'ออกแบบเว็บไซต์และเทคโนโลยีสร้างสรรค์'),
    ('Creative Industry & Trends', 'วงการสร้างสรรค์และเทรนด์')
) AS values_to_add("name", "name_th")
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" WHERE "categories"."name" = values_to_add."name"
);
