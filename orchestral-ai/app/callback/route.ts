// app/callback/route.ts
import { handleAuth } from "@workos-inc/authkit-nextjs";

export const GET = handleAuth({
  // Where to send the user after successful login
  returnPathname: "/dashboard/onboard",
});
