import { getBrand } from "@/lib/brand";
import { BrandEditor } from "../brand-editor";

export default async function BrandSettingsPage() {
  const brandRow = await getBrand();
  // Image bytes stay on the server; the client gets one flag and loads the
  // logo through /api/brand-logo.
  const {
    profileImageUrl,
    profileImageData,
    profileImageMime,
    logoData,
    logoMime,
    ...brandCols
  } = brandRow;
  void profileImageUrl;
  void profileImageMime;
  void logoMime;

  return <BrandEditor brand={{ ...brandCols, hasLogo: logoData !== "" || profileImageData !== "" }} />;
}
