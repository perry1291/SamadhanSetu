/**
 * Signed-in identity for the government header.
 *
 * Reads the user from the root route's loader, which resolved it server-side
 * from the HttpOnly session cookie. Nothing here reads a token, and there is no
 * client-side auth state to fall out of sync — logging out re-runs the loader.
 *
 * Identity only: the sign-in and sign-out controls live in the header
 * navigation, so there is exactly one entry point and one exit point rather than
 * a duplicate pair in the top banner.
 *
 * Renders nothing when anonymous, so the banner is unchanged for visitors.
 */
import { UserRound } from "lucide-react";

import { useTranslation } from "@/i18n/use-translation";
import { useOptionalUser } from "@/lib/use-optional-user";

export function CitizenSessionBar() {
  const { t } = useTranslation();

  // The root loader is the single source of session truth for the client.
  const user = useOptionalUser();

  if (user === null) return null;

  return (
    <span className="flex items-center gap-1.5 opacity-90">
      <UserRound className="size-3.5 shrink-0" aria-hidden />
      <span className="max-w-[10rem] truncate">
        {t("login.signedInAs", { name: user.fullName })}
      </span>
    </span>
  );
}
