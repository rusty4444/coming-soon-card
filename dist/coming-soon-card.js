/**
 * Coming Soon Card
 * Custom Lovelace card that displays upcoming movies (from Radarr) and
 * upcoming TV episodes (from Sonarr) with interleaved cycling and cinematic transitions.
 */

class ComingSoonCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = [];
    this._currentIndex = 0;
    this._cycleTimer = null;
    this._config = {};
    this._trailerCache = {};
  }

  setConfig(config) {
    if (!config.radarr_url) throw new Error('Please define radarr_url');
    if (!config.radarr_api_key) throw new Error('Please define radarr_api_key');
    if (!config.sonarr_url) throw new Error('Please define sonarr_url');
    if (!config.sonarr_api_key) throw new Error('Please define sonarr_api_key');

    this._config = {
      radarr_url: config.radarr_url,
      radarr_api_key: config.radarr_api_key,
      sonarr_url: config.sonarr_url,
      sonarr_api_key: config.sonarr_api_key,
      movies_count: config.movies_count || 5,
      shows_count: config.shows_count || 5,
      cycle_interval: config.cycle_interval || 8,
      title: config.title !== undefined ? config.title : 'Coming Soon',
      tmdb_api_key: config.tmdb_api_key || null,
      layout: config.layout || 'poster',
      image_type: config.image_type || 'poster',

      ...config,
    };

    // Apply height mode
    if (this._config.fill_height === false) {
      this.classList.add('fixed-height');
      const h = (this._config.card_height || 300) + 'px';
      this.style.setProperty('--card-fixed-height', h);
    } else {
      this.classList.remove('fixed-height');
    }

    this._render();
    this._fetchData();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  _formatDate(dateStr) {
    // dateStr: "2026-04-08" or ISO string
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const day = this._getOrdinal(d.getUTCDate());
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    return `${day} of ${month} ${year}`;
  }

  _formatCountdown(dateStr) {
    if (!dateStr) return '';
    // Parse just the date portion (YYYY-MM-DD), compare to today in local time
    const target = new Date(dateStr.substring(0, 10) + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today) / 86400000);

    if (diff < 0) return 'Available';
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 7) return `In ${diff} days`;
    if (diff < 14) return 'In 1 week';
    if (diff < 30) return `In ${Math.round(diff / 7)} weeks`;
    if (diff < 60) return 'In 1 month';
    if (diff < 365) return `In ${Math.round(diff / 30)} months`;
    return `In ${Math.round(diff / 365)} year${Math.round(diff / 365) === 1 ? '' : 's'}`;
  }

  _getPosterUrl(images) {
    if (!images) return '';
    const img = images.find(i => i.coverType === 'poster');
    return img ? img.remoteUrl : '';
  }

  _getFanartUrl(images) {
    if (!images) return '';
    const img = images.find(i => i.coverType === 'fanart');
    return img ? img.remoteUrl : '';
  }

  async _fetchData() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const end = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];

      const radarrBase = this._config.radarr_url.replace(/\/$/, '');
      const sonarrBase = this._config.sonarr_url.replace(/\/$/, '');

      // Fetch from Radarr and Sonarr in parallel
      const [radarrResp, sonarrResp] = await Promise.all([
        fetch(
          `${radarrBase}/api/v3/calendar?start=${today}&end=${end}&unmonitored=false`,
          { headers: { 'X-Api-Key': this._config.radarr_api_key } }
        ),
        fetch(
          `${sonarrBase}/api/v3/calendar?start=${today}&end=${end}&unmonitored=false&includeSeries=true`,
          { headers: { 'X-Api-Key': this._config.sonarr_api_key } }
        ),
      ]);

      let radarrItems = [];
      if (radarrResp.ok) {
        const data = await radarrResp.json();
        // Filter: must not have file, must have a digitalRelease date, and release must be today or future
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        radarrItems = (Array.isArray(data) ? data : [])
          .filter(m => !m.hasFile && m.digitalRelease && new Date(m.digitalRelease) >= now)
          .sort((a, b) => new Date(a.digitalRelease) - new Date(b.digitalRelease))
          .slice(0, this._config.movies_count);
      } else {
        console.warn('Coming Soon Card: Radarr HTTP', radarrResp.status);
      }

      let sonarrItems = [];
      if (sonarrResp.ok) {
        const data = await sonarrResp.json();
        // Filter: must not have file and air date must be today or future
        const nowSonarr = new Date();
        nowSonarr.setHours(0, 0, 0, 0);
        const filtered = (Array.isArray(data) ? data : [])
          .filter(ep => !ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) >= nowSonarr)
          .sort((a, b) => new Date(a.airDateUtc) - new Date(b.airDateUtc));
        // Dedupe: only show the first upcoming episode per series
        const seenSeries = new Set();
        sonarrItems = filtered.filter(ep => {
          const seriesId = ep.seriesId || (ep.series && ep.series.id);
          if (seenSeries.has(seriesId)) return false;
          seenSeries.add(seriesId);
          return true;
        }).slice(0, this._config.shows_count);
      } else {
        console.warn('Coming Soon Card: Sonarr HTTP', sonarrResp.status);
      }

      // Map movies
      const movieItems = radarrItems.map(m => {
        const genres = (m.genres || []).join(' · ');
        return {
          type: 'movie',
          typeLabel: 'Movie',
          title: m.title,
          year: m.year,
          subtitle: [m.year, genres].filter(Boolean).join(' · '),
          genres,
          releaseDate: m.digitalRelease,
          overview: m.overview || '',
          posterUrl: this._getPosterUrl(m.images),
          fanartUrl: this._getFanartUrl(m.images),
          tmdbId: m.tmdbId || null,
          rating: m.ratings && m.ratings.value ? m.ratings.value : null,
          trailerUrl: null,
        };
      });

      // Map TV episodes
      const tvItems = sonarrItems.map(ep => {
        const series = ep.series || {};
        const sNum = String(ep.seasonNumber || 0).padStart(2, '0');
        const eNum = String(ep.episodeNumber || 0).padStart(2, '0');
        const episodeLabel = `S${sNum}E${eNum}` + (ep.title ? ` · ${ep.title}` : '');
        // Try to get TMDB ID from series
        const tmdbId = series.tmdbId || null;
        return {
          type: 'tv',
          typeLabel: 'TV',
          title: series.title || ep.title || '',
          subtitle: episodeLabel,
          releaseDate: ep.airDate || (ep.airDateUtc ? ep.airDateUtc.split('T')[0] : null),
          overview: ep.overview || '',
          posterUrl: this._getPosterUrl(series.images),
          fanartUrl: this._getFanartUrl(series.images),
          tmdbId,
          seriesTitle: series.title || '',
          seasonNumber: ep.seasonNumber || null,
          episodeNumber: ep.episodeNumber || null,
          rating: null,
          trailerUrl: null,
        };
      });

      // Interleave: movie, show, movie, show, ...
      const interleaved = [];
      const maxLen = Math.max(movieItems.length, tvItems.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < movieItems.length) interleaved.push(movieItems[i]);
        if (i < tvItems.length) interleaved.push(tvItems[i]);
      }

      this._items = interleaved;
      this._currentIndex = 0;
      this._updateDisplay();
      this._startCycle();
    } catch (err) {
      console.warn('Coming Soon Card: Fetch error', err);
      const errEl = this.shadowRoot.querySelector('.error-msg');
      if (errEl) {
        errEl.textContent = `Could not fetch data: ${err.message}`;
        errEl.style.display = 'block';
      }
    }
  }

  _startCycle() {
    if (this._cycleTimer) clearInterval(this._cycleTimer);
    if (this._items.length <= 1) return;

    this._cycleTimer = setInterval(() => {
      this._currentIndex = (this._currentIndex + 1) % this._items.length;
      this._updateDisplay();
    }, this._config.cycle_interval * 1000);
  }

  _updateDisplay() {
    if (!this._items.length) return;
    const item = this._items[this._currentIndex];
    const root = this.shadowRoot;

    // Background art transition
    const bgEl = root.querySelector('.bg-art');
    const bgNew = root.querySelector('.bg-art-next');
    if (bgNew && item.fanartUrl) {
      bgNew.style.backgroundImage = `url(${item.fanartUrl})`;
      bgNew.classList.add('active');
      setTimeout(() => {
        if (bgEl) bgEl.style.backgroundImage = bgNew.style.backgroundImage;
        bgNew.classList.remove('active');
      }, 800);
    } else if (bgEl && item.fanartUrl) {
      bgEl.style.backgroundImage = `url(${item.fanartUrl})`;
    }

    // Poster — choose image based on image_type config
    const useImage = this._config.image_type === 'fanart' ? item.fanartUrl : item.posterUrl;
    const posterEl = root.querySelector('.poster');
    if (posterEl && useImage) {
      posterEl.style.opacity = '0';
      const img = new Image();
      img.onload = () => {
        posterEl.src = img.src;
        posterEl.style.opacity = '1';
      };
      img.src = useImage;
    }

    // Text elements — use querySelectorAll so both poster-overlay and info panel copies get updated
    root.querySelectorAll('.item-title').forEach(el => { el.textContent = item.title; });
    root.querySelectorAll('.item-subtitle').forEach(el => { el.textContent = item.subtitle; });
    root.querySelectorAll('.item-type').forEach(el => {
      el.textContent = item.typeLabel;
      el.className = `item-type ${item.type}`;
    });
    root.querySelectorAll('.item-summary').forEach(el => { el.textContent = item.overview; });

    const dotsEl = root.querySelector('.dots');
    const counterEl = root.querySelector('.counter');

    // Countdown + date — update all copies
    root.querySelectorAll('.item-countdown').forEach(el => {
      el.textContent = item.releaseDate ? this._formatCountdown(item.releaseDate) : '';
    });
    root.querySelectorAll('.item-date').forEach(el => {
      el.textContent = item.releaseDate ? this._formatDate(item.releaseDate) : '';
    });
    // Keep separator in sync
    root.querySelectorAll('.item-countdown-sep').forEach(el => { el.textContent = '·'; });

    // Dots — color-coded: gold for movies, blue for TV
    if (dotsEl) {
      dotsEl.innerHTML = this._items
        .map((it, i) => {
          const colorClass = it.type === 'movie' ? 'movie' : 'tv';
          const activeClass = i === this._currentIndex ? 'active' : '';
          return `<span class="dot ${colorClass} ${activeClass}"></span>`;
        })
        .join('');
    }

    // Counter
    if (counterEl) {
      counterEl.textContent = `${this._currentIndex + 1} / ${this._items.length}`;
    }

    // Trailer button — lazy fetch
    const trailerBtn = root.querySelector('.trailer-btn');
    if (trailerBtn) {
      trailerBtn.classList.remove('visible');
      trailerBtn.onclick = null;

      const showTrailerBtn = (url) => {
        if (url && this._items[this._currentIndex] === item) {
          trailerBtn.classList.add('visible');
          trailerBtn.onclick = (e) => { e.stopPropagation(); this._playTrailer(url); };
        }
      };

      if (item.trailerUrl) {
        showTrailerBtn(item.trailerUrl);
      } else if (item.trailerUrl === null && this._config.tmdb_api_key) {
        // Not yet fetched
        let fetchPromise;
        if (item.type === 'movie' && item.tmdbId) {
          fetchPromise = this._fetchMovieTrailer(item.tmdbId);
        } else if (item.type === 'tv' && item.tmdbId) {
          fetchPromise = this._fetchTvTrailer(item.tmdbId, item.seriesTitle);
        } else if (item.type === 'tv' && item.seriesTitle) {
          // Fall back to title search
          fetchPromise = this._fetchTvTrailerByTitle(item.seriesTitle);
        }
        if (fetchPromise) {
          fetchPromise.then((url) => {
            item.trailerUrl = url || undefined;
            showTrailerBtn(url);
          });
        }
      }
    }
  }

  _getYouTubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube\.com\/v\/)([-\w]{11})/);
    return match ? match[1] : null;
  }

  async _fetchMovieTrailer(tmdbId) {
    const cacheKey = `movie_${tmdbId}`;
    if (cacheKey in this._trailerCache) return this._trailerCache[cacheKey];
    try {
      const resp = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}/videos?language=en-US`,
        { headers: { Accept: 'application/json', Authorization: `Bearer ${this._config.tmdb_api_key}` } }
      );
      if (!resp.ok) throw new Error(`TMDB HTTP ${resp.status}`);
      const data = await resp.json();
      const videos = data.results || [];
      const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official) ||
                      videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                      videos.find(v => v.site === 'YouTube');
      const youtubeUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
      this._trailerCache[cacheKey] = youtubeUrl;
      return youtubeUrl;
    } catch (err) {
      console.warn('Coming Soon Card: Movie trailer fetch error', err);
      this._trailerCache[cacheKey] = null;
      return null;
    }
  }

  async _fetchTvTrailer(tmdbId, seriesTitle) {
    const cacheKey = `tv_${tmdbId}`;
    if (cacheKey in this._trailerCache) return this._trailerCache[cacheKey];
    try {
      const resp = await fetch(
        `https://api.themoviedb.org/3/tv/${tmdbId}/videos?language=en-US`,
        { headers: { Accept: 'application/json', Authorization: `Bearer ${this._config.tmdb_api_key}` } }
      );
      if (!resp.ok) throw new Error(`TMDB HTTP ${resp.status}`);
      const data = await resp.json();
      const videos = data.results || [];
      const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official) ||
                      videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                      videos.find(v => v.site === 'YouTube');
      const youtubeUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
      this._trailerCache[cacheKey] = youtubeUrl;
      return youtubeUrl;
    } catch (err) {
      console.warn('Coming Soon Card: TV trailer fetch error', err);
      this._trailerCache[cacheKey] = null;
      return null;
    }
  }

  async _fetchTvTrailerByTitle(title) {
    const cacheKey = `tv_title_${title}`;
    if (cacheKey in this._trailerCache) return this._trailerCache[cacheKey];
    try {
      // Search TMDB for the show
      const searchResp = await fetch(
        `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(title)}&language=en-US`,
        { headers: { Accept: 'application/json', Authorization: `Bearer ${this._config.tmdb_api_key}` } }
      );
      if (!searchResp.ok) throw new Error(`TMDB search HTTP ${searchResp.status}`);
      const searchData = await searchResp.json();
      const results = searchData.results || [];
      if (!results.length) { this._trailerCache[cacheKey] = null; return null; }
      const tmdbId = results[0].id;
      const url = await this._fetchTvTrailer(tmdbId, title);
      this._trailerCache[cacheKey] = url;
      return url;
    } catch (err) {
      console.warn('Coming Soon Card: TV title trailer fetch error', err);
      this._trailerCache[cacheKey] = null;
      return null;
    }
  }

  _playTrailer(url) {
    const ytId = this._getYouTubeId(url);
    if (!ytId) return;

    // Pause cycling
    if (this._cycleTimer) {
      clearInterval(this._cycleTimer);
      this._cycleTimer = null;
    }

    // Create fullscreen overlay on document.body
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:90vw;max-width:960px;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden;';

    const playerDiv = document.createElement('div');
    playerDiv.id = 'yt-trailer-player-' + Date.now();
    playerDiv.style.cssText = 'width:100%;height:100%;';
    wrapper.appendChild(playerDiv);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText = 'position:absolute;top:8px;right:8px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:100001;';
    wrapper.appendChild(closeBtn);

    overlay.appendChild(wrapper);
    document.body.appendChild(overlay);

    const self = this;
    const close = () => {
      if (self._ytPlayer) { try { self._ytPlayer.destroy(); } catch(e) {} self._ytPlayer = null; }
      overlay.remove();
      self._startCycle();
    };
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    overlay.addEventListener('click', close);
    wrapper.addEventListener('click', (e) => e.stopPropagation());

    // Load YouTube IFrame API and create player
    const initPlayer = () => {
      self._ytPlayer = new YT.Player(playerDiv.id, {
        width: '100%',
        height: '100%',
        videoId: ytId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const check = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(check);
          initPlayer();
        }
      }, 100);
      setTimeout(() => clearInterval(check), 10000);
    }
  }

  _render() {
    const title = this._config.title;
    const layout = this._config.layout || 'poster';
    const imageType = this._config.image_type || 'poster';
    const cardClasses = `card layout-${layout} image-${imageType}`;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --card-bg: #1a1a1a;
          --card-border: rgba(255,255,255,0.06);
          --text-primary: #f0f0f0;
          --text-secondary: #999;
          --text-dim: #666;
          --accent-gold: #c9a73b;
          --accent-movie: #c9a73b;
          --accent-tv: #5b9bd5;
        }

        ha-card {
          box-sizing: border-box;
          position: relative;
          background: var(--card-bg) !important;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--card-border) !important;
        }

        :host(.fixed-height) ha-card {
          height: var(--card-fixed-height, 300px);
        }

        :host(.fixed-height) .card {
          height: var(--card-fixed-height, 300px);
        }

        .card {
          position: relative;
          background: var(--card-bg);
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          user-select: none;
        }

        /* Background art with blur */
        .bg-art, .bg-art-next {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background-size: cover;
          background-position: center;
          filter: blur(20px) brightness(0.3);
          transform: scale(1.1);
          transition: opacity 0.8s ease;
        }
        .bg-art-next {
          opacity: 0;
        }
        .bg-art-next.active {
          opacity: 1;
        }

        /* Dark overlay */
        .bg-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(
            135deg,
            rgba(0,0,0,0.7) 0%,
            rgba(0,0,0,0.4) 50%,
            rgba(0,0,0,0.7) 100%
          );
        }

        /* Content */
        .content {
          position: relative;
          z-index: 1;
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* Header */
        .header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
          width: 100%;
        }

        .header-title {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }

        .card-icon {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          display: inline-block;
          vertical-align: middle;
          fill: var(--accent-gold);
        }

        .counter {
          font-size: 13px;
          color: var(--text-dim);
          font-variant-numeric: tabular-nums;
        }

        /* Main area */
        .main {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          width: 100%;
        }

        /* Poster */
        .poster-wrap {
          position: relative;
          width: clamp(140px, 50%, 220px);
          aspect-ratio: 2/3;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(0,0,0,0.6);
          background: #111;
          flex-shrink: 0;
        }

        .poster {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: opacity 0.5s ease;
        }

        .poster-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 12px;
          background: linear-gradient(transparent, rgba(0,0,0,0.85));
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .poster-shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.03) 50%,
            transparent 100%
          );
          animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        /* Info panel (detailed layout) */
        .info {
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-width: 0;
          justify-content: center;
        }

        /* Layout: poster (default) */
        .layout-poster .info { display: none; }
        .layout-poster .poster-overlay { display: flex; }

        /* Layout: detailed */
        .layout-detailed .poster-overlay { display: none; }
        .layout-detailed .info { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
        .layout-detailed .main { flex-direction: row; gap: 20px; align-items: flex-start; }
        .layout-detailed .poster-wrap { width: clamp(100px, 30%, 180px); aspect-ratio: 2/3; }
        .layout-detailed .content { align-items: flex-start; }

        /* Image type: fanart */
        .image-fanart .poster-wrap { aspect-ratio: 16/9; width: clamp(200px, 80%, 400px); }
        .image-fanart.layout-detailed .main { flex-direction: column; }
        .image-fanart.layout-detailed .poster-wrap { width: 100%; }

        /* Shared text element styles */
        .item-type {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 3px;
          width: fit-content;
        }

        .item-type.movie {
          background: rgba(201, 167, 59, 0.15);
          color: var(--accent-movie);
        }

        .item-type.tv {
          background: rgba(91, 155, 213, 0.15);
          color: var(--accent-tv);
        }

        /* Poster layout text styles (inside poster-overlay) */
        .poster-overlay .item-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
        }

        .poster-overlay .item-subtitle {
          font-size: 12px;
          color: rgba(255,255,255,0.8);
          line-height: 1.3;
          text-align: center;
        }

        .poster-overlay .meta-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .poster-overlay .item-countdown {
          font-size: 14px;
          font-weight: 600;
          color: var(--accent-gold);
        }

        .poster-overlay .meta-separator {
          font-size: 12px;
          color: rgba(255,255,255,0.5);
        }

        .poster-overlay .item-date {
          font-size: 13px;
          color: rgba(255,255,255,0.7);
        }

        /* Detailed layout info panel text styles */
        .info .item-title {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
        }

        .info .item-subtitle {
          font-size: 15px;
          color: rgba(255,255,255,0.75);
          line-height: 1.4;
        }

        .info .meta-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .info .item-countdown {
          font-size: 14px;
          font-weight: 700;
          color: var(--accent-gold);
        }

        .info .meta-separator {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
        }

        .info .item-date {
          font-size: 14px;
          color: var(--text-dim);
        }

        .info .item-summary {
          font-size: 14px;
          color: var(--text-dim);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 5;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Dots — color-coded */
        .dots {
          display: flex;
          justify-content: center;
          gap: 6px;
          padding-top: 16px;
          flex-shrink: 0;
        }

        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          transition: all 0.3s ease;
        }

        .dot.movie {
          background: rgba(201, 167, 59, 0.25);
        }

        .dot.tv {
          background: rgba(91, 155, 213, 0.25);
        }

        .dot.active.movie {
          background: var(--accent-movie);
          box-shadow: 0 0 6px rgba(201, 167, 59, 0.4);
          width: 18px;
          border-radius: 3px;
        }

        .dot.active.tv {
          background: var(--accent-tv);
          box-shadow: 0 0 6px rgba(91, 155, 213, 0.4);
          width: 18px;
          border-radius: 3px;
        }

        /* Trailer button */
        .trailer-btn {
          display: none;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ddd;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 100px;
          min-height: 38px;
        }

        .trailer-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .trailer-btn.visible {
          display: inline-flex;
        }

        .trailer-btn svg {
          width: 16px;
          height: 16px;
          fill: currentColor;
        }

        /* Error */
        .error-msg {
          display: none;
          text-align: center;
          padding: 20px;
          color: #cc4444;
          font-size: 12px;
        }

        /* Loading */
        .loading {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-dim);
          font-size: 12px;
        }
      </style>

      <ha-card>
        <div class="${cardClasses}">
          <div class="bg-art"></div>
          <div class="bg-art-next"></div>
          <div class="bg-overlay"></div>

          <div class="content">
            ${title ? `
            <div class="header">
              <span class="header-title">
                <svg class="card-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 2l.01 6L10 12l-3.99 4.01L6 22h12v-6.01L14 12l4-4V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z"/>
                </svg>
                ${title}
              </span>
              <button class="trailer-btn">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                Trailer
              </button>
              <span class="counter"></span>
            </div>
            ` : ''}

            <div class="error-msg"></div>

            <div class="main">
              <div class="poster-wrap">
                <img class="poster" src="" alt="">
                <div class="poster-shimmer"></div>
              </div>
              <!-- poster layout overlay -->
              <div class="poster-overlay">
                <span class="item-type"></span>
                <div class="item-title"></div>
                <div class="item-subtitle"></div>
                <div class="meta-row">
                  <span class="item-countdown"></span>
                  <span class="meta-separator item-countdown-sep"></span>
                  <span class="item-date"></span>
                </div>
              </div>
              <!-- detailed layout info panel -->
              <div class="info">
                <span class="item-type"></span>
                <div class="item-title"></div>
                <div class="item-subtitle"></div>
                <div class="meta-row">
                  <span class="item-countdown"></span>
                  <span class="meta-separator item-countdown-sep"></span>
                  <span class="item-date"></span>
                </div>
                <div class="item-summary"></div>
              </div>
            </div>

            <div class="dots"></div>
          </div>
        </div>
      </ha-card>
    `;

    this._attachSwipeListeners();
  }

  _attachSwipeListeners() {
    const card = this.shadowRoot.querySelector('.card');
    if (!card) return;

    // Touch swipe
    card.addEventListener('touchstart', (e) => {
      this._touchStartX = e.touches[0].clientX;
      this._touchStartY = e.touches[0].clientY;
      this._touchStartTime = Date.now();
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - this._touchStartX;
      const dy = e.changedTouches[0].clientY - this._touchStartY;
      const dt = Date.now() - this._touchStartTime;
      this._handleSwipe(dx, dy, dt);
    }, { passive: true });

    // Mouse drag (for desktop)
    card.addEventListener('mousedown', (e) => {
      this._touchStartX = e.clientX;
      this._touchStartY = e.clientY;
      this._touchStartTime = Date.now();
      this._mouseDown = true;
    });

    card.addEventListener('mouseup', (e) => {
      if (!this._mouseDown) return;
      this._mouseDown = false;
      const dx = e.clientX - this._touchStartX;
      const dy = e.clientY - this._touchStartY;
      const dt = Date.now() - this._touchStartTime;
      this._handleSwipe(dx, dy, dt);
    });

    card.addEventListener('mouseleave', () => { this._mouseDown = false; });
  }

  _handleSwipe(dx, dy, dt) {
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= 50 && dt < 500) {
      if (dx < 0) {
        this._currentIndex = (this._currentIndex + 1) % this._items.length;
      } else {
        this._currentIndex = (this._currentIndex - 1 + this._items.length) % this._items.length;
      }
      this._updateDisplay();
      // Reset cycle timer
      if (this._cycleTimer) {
        clearInterval(this._cycleTimer);
        this._startCycle();
      }
    }
  }

  getCardSize() {
    return 4;
  }

  static getStubConfig() {
    return {
      radarr_url: 'http://192.168.1.100:7878',
      radarr_api_key: 'YOUR_RADARR_API_KEY',
      sonarr_url: 'http://192.168.1.100:8989',
      sonarr_api_key: 'YOUR_SONARR_API_KEY',
      movies_count: 5,
      shows_count: 5,
      cycle_interval: 8,
      title: 'Coming Soon',
      fill_height: true,
      layout: 'poster',
      image_type: 'poster',
    };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: 'radarr_url',
          required: true,
          selector: { text: {} },
        },
        {
          name: 'radarr_api_key',
          required: true,
          selector: { text: { type: 'password' } },
        },
        {
          name: 'sonarr_url',
          required: true,
          selector: { text: {} },
        },
        {
          name: 'sonarr_api_key',
          required: true,
          selector: { text: { type: 'password' } },
        },
        {
          type: 'grid',
          name: '',
          schema: [
            {
              name: 'movies_count',
              selector: { number: { min: 1, max: 20, mode: 'box' } },
            },
            {
              name: 'shows_count',
              selector: { number: { min: 1, max: 20, mode: 'box' } },
            },
          ],
        },
        {
          type: 'grid',
          name: '',
          schema: [
            {
              name: 'cycle_interval',
              selector: { number: { min: 3, max: 60, mode: 'box', unit_of_measurement: 'seconds' } },
            },
            {
              name: 'title',
              selector: { text: {} },
            },
          ],
        },
        {
          name: 'tmdb_api_key',
          selector: { text: { type: 'password' } },
        },
        {
          name: 'fill_height',
          selector: { boolean: {} },
        },
        {
          name: 'card_height',
          selector: { number: { min: 200, max: 800, mode: 'box', unit_of_measurement: 'px' } },
        },
        {
          type: 'grid',
          name: '',
          schema: [
            {
              name: 'layout',
              selector: { select: { options: [
                { value: 'poster', label: 'Poster (centred)' },
                { value: 'detailed', label: 'Detailed (poster + info)' },
              ]}},
            },
            {
              name: 'image_type',
              selector: { select: { options: [
                { value: 'poster', label: 'Poster art' },
                { value: 'fanart', label: 'Key art / Fanart' },
              ]}},
            },
          ],
        },
      ],
      computeLabel: (schema) => {
        const labels = {
          radarr_url: 'Radarr Server URL',
          radarr_api_key: 'Radarr API Key',
          sonarr_url: 'Sonarr Server URL',
          sonarr_api_key: 'Sonarr API Key',
          movies_count: 'Number of Movies',
          shows_count: 'Number of TV Shows',
          cycle_interval: 'Cycle Interval',
          title: 'Card Title',
          tmdb_api_key: 'TMDB API Key (for trailers)',
          fill_height: 'Fill Container Height',
          card_height: 'Card Height',
          layout: 'Layout',
          image_type: 'Image Type',
        };
        return labels[schema.name] || schema.name;
      },
      computeHelper: (schema) => {
        const helpers = {
          radarr_url: 'e.g. http://192.168.1.100:7878',
          radarr_api_key: 'Found in Radarr → Settings → General → API Key',
          sonarr_url: 'e.g. http://192.168.1.100:8989',
          sonarr_api_key: 'Found in Sonarr → Settings → General → API Key',
          tmdb_api_key: 'Optional — enables trailer button. Get a free key at themoviedb.org',
          fill_height: 'Enable if your card has proper height from the layout. Disable if collapsed.',
          card_height: 'Height in pixels when Fill Container Height is off. Default: 300',
          layout: 'Poster: centred design with info on the poster. Detailed: poster on the left, text on the right.',
          image_type: 'Poster: use the cover art. Fanart: use the backdrop/key art (landscape).',
        };
        return helpers[schema.name] || undefined;
      },
    };
  }

  disconnectedCallback() {
    if (this._cycleTimer) {
      clearInterval(this._cycleTimer);
      this._cycleTimer = null;
    }
  }
}

customElements.define('coming-soon-card', ComingSoonCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'coming-soon-card',
  name: 'Coming Soon',
  description: 'Auto-cycling display of upcoming movies (Radarr) and TV episodes (Sonarr), interleaved with countdown dates.',
});
