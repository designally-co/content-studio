import { redirect } from "next/navigation";

/** The composer moved to the home page. Kept so existing links and bookmarks
 *  land somewhere real instead of a 404, and so there is one canonical URL —
 *  two routes rendering the same page would leave the nav unable to say which
 *  destination you are on. */
export default function NewContentRedirect() {
  redirect("/");
}
