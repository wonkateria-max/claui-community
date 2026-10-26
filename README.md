# Claui Community

Claui's official community website for late-night games, viewer stories, community picks and featured clips.

**Official website:** https://claui-community.pages.dev/

The public link stays the same when the site is updated. The approved design and the three featured videos work on desktop and phone-width layouts. Featured clips use the website's native video player; TikFinity is only needed for capturing new supporter rankings.

Cloudflare Pages deploys automatically from `main`. The project uses the `None` framework preset, build command `exit 0`, and build output directory `.`. No build environment variables are required.

Both the live-status and community-updates Edge Functions allow the exact production origins `https://claui-community.pages.dev` and `https://wonkateria-max.github.io`, plus the existing localhost development origins. Other Pages projects and preview subdomains are not automatically trusted. Pairing links use `/bridge.html` on Cloudflare and `/claui-community/bridge.html` on GitHub Pages. The original GitHub Pages address remains supported.

The private control room is `admin.html` and requires an authorized sign-in. Preview, bridge and admin pages are marked noindex.

Implementation notes:

- [Supporters and featured videos](supabase/COMMUNITY_HIGHLIGHTS.md)
- [Automatic LIVE/OFFLINE status](supabase/LIVE_STATUS.md)
- [Featured video sources](assets/videos/README.md)
