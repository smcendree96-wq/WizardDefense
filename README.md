# Mooncap Keep

Mooncap Keep is a browser game that can be hosted as a static GitHub Pages site. The campaign works on its own and saves locally. Supabase adds online accounts, cross-browser profile stats, friend requests, and shared public hiscores.

## Turn on online play

1. Create a Supabase project at [supabase.com](https://supabase.com/).
2. In the project dashboard, open **SQL Editor**, paste in [`supabase/schema.sql`](supabase/schema.sql), and run it once.
3. Open **Project Settings → API** and copy the project URL and its public anon/publishable key. Paste those into [`supabase-config.js`](supabase-config.js). This key is intended for browser use; never use a `service_role` or secret key in this site.
4. In **Authentication → URL Configuration**, set the Site URL to the full published site URL. Add the published URL (and your local development URL if you use one) to the allowed redirect URLs. For a project site, the published address usually looks like `https://YOUR-NAME.github.io/YOUR-REPOSITORY/`; a custom domain can be used instead.
5. In **Authentication → Providers → Email**, choose whether new accounts must confirm their email. With confirmation enabled, players confirm the message they receive, then return to the site and sign in.

## Publish on GitHub Pages

1. Create a GitHub repository and upload the site files and `supabase` folder to its root. Keep `index.html`, `online.js`, `supabase-config.js`, and `.nojekyll` together.
2. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
3. Wait for the Pages deployment and open the URL GitHub provides. The site becomes available at the repository's `github.io` address. To use your own domain, add it in the Pages settings and follow GitHub's DNS instructions.
4. Add that final HTTPS address to the Supabase Auth URL configuration, then create an account from the **Player profile** page.

The site uses the Supabase JavaScript v2 CDN, so online accounts and shared data require an internet connection. The game itself remains playable when Supabase has not been configured.

## Online data and score integrity

Player names and the four public ranking totals are visible to anyone who opens the hiscores page. Friend requests are visible only to their sender and recipient. Row Level Security is enabled by the schema. Each browser can update its own displayed stats, so the client-only hiscores are suitable for a casual game but are not tamper-proof. A competitive season would need server-verified gameplay and score updates.

Progress is merged using the higher value for each stat, so signing in on another browser won't lower a score already stored online. It does not add separate browser totals together.

## Source references

- [GitHub Pages custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains)
- [Supabase JavaScript sign-in with password](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Supabase JavaScript client installation](https://supabase.com/docs/reference/javascript/installing)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
