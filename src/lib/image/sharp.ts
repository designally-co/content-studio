import "server-only";

/**
 * sharp, loaded only when an image is actually being handled.
 *
 * IT USED TO BE A TOP-LEVEL IMPORT, AND THAT BROKE DRAFTING IN PRODUCTION.
 * Next bundles every "use server" module on a page into one server bundle, so
 * `POST /pipeline/[id]` — which is *any* action on that page, including the
 * research plan and the draft — loaded sharp before running a line of its own.
 * On Vercel's linux-x64 runtime sharp could not dlopen (`libvips-cpp.so`
 * missing) and the request 500'd with nothing to do with images in it. Locally
 * the darwin binaries are present, so it never failed here.
 *
 * Importing it inside the functions that need it keeps a native module off the
 * path of every other action on the page. Worth doing on its own merits: no
 * action should pay to load a binary it never calls.
 *
 * It lives in its own module because `storage.ts` needs it too, and storage is
 * what `pipeline/images.ts` imports — putting the loader in the latter and
 * reaching back for it would be a cycle.
 */
export async function loadSharp() {
  return (await import("sharp")).default;
}
