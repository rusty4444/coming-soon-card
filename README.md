# Coming Soon Card

A cinematic Home Assistant card that displays upcoming movies and TV episodes from your [Radarr](https://radarr.video/) and [Sonarr](https://sonarr.tv/) libraries. Poster-centric design with countdown timers, release dates, and trailer playback.

<p align="center">
  <img src="screenshots/coming-soon-card.jpg" alt="Coming Soon Card" width="400">
</p>

## Features

- **Upcoming movies** from Radarr with digital release dates
- **Upcoming TV episodes** from Sonarr with air dates and season/episode numbers
- **Countdown timer** — "In 5 days", "Tomorrow", "Today"
- **Formatted release date** — "8th of April 2026"
- **Poster-centric design** — movie/show poster front and centre with info overlaid
- **Blurred background art** — cinematic fanart behind the poster
- **Trailer button** — plays trailers via TMDB (optional, requires free API key)
- **Auto-cycling** — rotates through upcoming items with smooth transitions
- **Color-coded dots** — gold for movies, blue for TV shows
- **Visual editor** — configure everything from the HA UI, no YAML needed
- **Responsive** — poster scales to fit any card width
- **Filters past releases** — only shows items with future release/air dates that haven't been downloaded yet
- **Deduplicates TV shows** — only shows the next upcoming episode per series, even if multiple episodes air the same day

---

## Install via HACS (Recommended)

1. Open **HACS** in Home Assistant
2. Click the **three dots** menu (top right) → **Custom repositories**
3. Paste `https://github.com/rusty4444/coming-soon-card` and select **Dashboard** as the category
4. Click **Add**
5. Search for **Coming Soon Card** in HACS → **Download**
6. Refresh your browser (Ctrl+Shift+R)

## Install Manually

1. Download `coming-soon-card.js` from the [latest release](https://github.com/rusty4444/coming-soon-card/releases)
2. Copy it to `/config/www/coming-soon-card.js`
3. Go to **Settings → Dashboards → Resources** and add:
   - URL: `/local/coming-soon-card.js`
   - Type: JavaScript Module
4. Refresh your browser

---

## Visual Editor

The card includes a built-in visual editor. When you add or edit the card, you'll see a graphical form instead of raw YAML.

You can still use YAML if you prefer — click "Show code editor" at the bottom of the editor.

---

## Configuration

Search for the card by name in the **Add Card** dialog — you can configure everything using the visual editor.

Or add a **Manual card** with this YAML:

```yaml
type: custom:coming-soon-card
radarr_url: http://YOUR_RADARR_IP:7878
radarr_api_key: YOUR_RADARR_API_KEY
sonarr_url: http://YOUR_SONARR_IP:8989
sonarr_api_key: YOUR_SONARR_API_KEY
movies_count: 5
shows_count: 5
cycle_interval: 8
title: Coming Soon
tmdb_api_key: YOUR_TMDB_READ_ACCESS_TOKEN  # Optional: enables trailer button
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `radarr_url` | string | **Required** | Your Radarr server URL (e.g., `http://192.168.1.100:7878`) |
| `radarr_api_key` | string | **Required** | Your Radarr API key |
| `sonarr_url` | string | **Required** | Your Sonarr server URL (e.g., `http://192.168.1.100:8989`) |
| `sonarr_api_key` | string | **Required** | Your Sonarr API key |
| `movies_count` | number | `5` | Number of upcoming movies to display |
| `shows_count` | number | `5` | Number of upcoming TV episodes to display |
| `cycle_interval` | number | `8` | Seconds between cycling to the next item |
| `title` | string | `"Coming Soon"` | Header text (set to empty string to hide) |
| `tmdb_api_key` | string | Empty (trailers disabled) | TMDB Read Access Token — enables the trailer button |
| `fill_height` | boolean | `true` | When enabled, card stretches to fill its container. Disable if the card appears collapsed |
| `card_height` | number | `300` | Card height in pixels (only used when `fill_height` is `false`) |

### Finding your API keys

**Radarr**: Settings → General → API Key

**Sonarr**: Settings → General → API Key

**TMDB** (optional, for trailers):
1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup)
2. Go to [API Settings](https://www.themoviedb.org/settings/api)
3. Copy the **Read Access Token** (not the API Key)

---

## How It Works

The card fetches upcoming items from Radarr and Sonarr's calendar APIs (next 90 days), filters out anything already downloaded or with a past release date, then displays them in an alternating movie/show cycle with cinematic transitions.

- **Movies**: sorted by digital release date (soonest first)
- **TV Episodes**: sorted by air date (soonest first)
- Items are interleaved: movie, show, movie, show...

---

## Known Issues

- **Geo-restricted trailers**: Some trailers may show "Video unavailable — The uploader has not made this video available in your country." This is a YouTube/TMDB restriction and cannot be fixed by the card.

---

## Related

Looking for recently added content instead of upcoming? Check out:

- [plex-recently-added-card](https://github.com/rusty4444/plex-recently-added-card) — for Plex
- [jellyfin-recently-added-card](https://github.com/rusty4444/jellyfin-recently-added-card) — for Jellyfin
- [emby-recently-added-card](https://github.com/rusty4444/emby-recently-added-card) — for Emby
- [kodi-recently-added-card](https://github.com/rusty4444/kodi-recently-added-card) — for Kodi

---

## Credits

Built for the Home Assistant community.
