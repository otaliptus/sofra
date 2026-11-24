// These are the CC BY recordings from Alleys of Istanbul. Only the current
// track gets a media URL, so the other three consume no bandwidth.
const tracks = [
  { title: 'Muhabbet', file: '10_-_-Muhabet', shard: 'f/fa', duration: 233.04, cue: 45 },
  { title: 'Anadolu Kavağı', file: '04_-_-Anadolu_Kavagi', shard: '8/8b', duration: 298.45, cue: 0 },
  { title: 'Bir Demet Yasemen', file: '14_-_-Bir_Demet_Yasemen', shard: 'b/bd', duration: 491.21, cue: 0 },
  { title: 'Üsküdar’a Gider İken', file: '01_-_-Uskudara_Gideriken', shard: '4/41', duration: 192.73, cue: 0 }
];
const filename = track => 'Turku_Nomads_of_the_Silk_Road_-_' + track.file + '.ogg';
const commons = 'https://upload.wikimedia.org/wikipedia/commons/';

export function musicCredits() {
  const sources = tracks.map(track =>
    '<a href="https://commons.wikimedia.org/wiki/File:' + filename(track) + '" target="_blank" rel="noopener">' + track.title + '</a>'
  );
  return '<details class="music-credits"><summary>Müzik ve lisans</summary><p>Turku, Nomads of the Silk Road · <i>Alleys of Istanbul</i></p><p>' +
    sources.join(' · ') + '</p><p><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · Kayıtlar Wikimedia Commons üzerinden çalınır. Muhabbet 0:45’ten başlar.</p></details>';
}

const bookmarkKey = 'sofra.music.v1';
const clock = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2,'0');

function readBookmark() {
  try {
    const saved = JSON.parse(localStorage.getItem(bookmarkKey));
    const index = tracks.findIndex(track => track.file === saved?.file);
    if (index >= 0 && Number.isFinite(saved.seconds) && typeof saved.paused === 'boolean') {
      return { index, seconds: Math.max(0, Math.min(saved.seconds, tracks[index].duration)), paused: saved.paused };
    }
  } catch { /* Playback also works with storage unavailable. */ }
  return { index: 0, seconds: tracks[0].cue, paused: false };
}

export function mountMusic(initiallyMuted, saveMute) {
  const audio = document.querySelector('#soundtrack');
  const radio = document.querySelector('#radio');
  const toggle = document.querySelector('#music-toggle');
  const panel = document.querySelector('#music-panel');
  const play = document.querySelector('#music-play');
  const mute = document.querySelector('#audio');
  const name = document.querySelector('#track-name');
  const time = document.querySelector('#music-time');
  const saved = readBookmark();
  let index = saved.index, heldPosition = saved.seconds, wanted = !saved.paused;
  let pendingPosition = true, useOriginal = false, failedTracks = 0, lastWrite = 0;
  let lastBookmark = JSON.stringify({file:tracks[index].file, seconds:heldPosition, paused:!wanted});
  audio.volume = 0.28;
  audio.muted = initiallyMuted;

  function duration() {
    return audio.readyState >= 1 && Number.isFinite(audio.duration) ? audio.duration : tracks[index].duration;
  }
  function position() {
    return pendingPosition || !audio.readyState ? heldPosition : audio.currentTime;
  }
  function remember() {
    heldPosition = position();
    const bookmark = JSON.stringify({file: tracks[index].file, seconds: heldPosition, paused: !wanted});
    lastWrite = performance.now();
    if (bookmark === lastBookmark) return;
    try {
      localStorage.setItem(bookmarkKey, bookmark);
      lastBookmark = bookmark;
    } catch { /* Keep the in-memory playhead. */ }
  }
  function showTime() {
    if (!panel.hidden) time.textContent = clock(position()) + ' / ' + clock(duration());
  }
  function show() {
    const title = tracks[index].title;
    const action = !audio.paused ? 'Müziği duraklat' : failedTracks === tracks.length ? 'Yeniden dene' : 'Müziği çal';
    play.dataset.playing = String(!audio.paused);
    play.title = action + ' · ' + title;
    play.setAttribute('aria-label', play.title);
    mute.dataset.muted = String(audio.muted);
    mute.title = audio.muted ? 'Sesi aç' : 'Sesi kapat';
    mute.setAttribute('aria-label', mute.title);
    if (name.textContent !== title) name.textContent = title;
    showTime();
  }
  function disclose(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) showTime();
  }
  toggle.onclick = () => disclose(panel.hidden);
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !radio.contains(event.target)) disclose(false);
  }, true);
  radio.addEventListener('focusout', event => {
    if (event.relatedTarget && !radio.contains(event.relatedTarget)) disclose(false);
  });
  radio.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.stopPropagation();disclose(false);toggle.focus();
    }
  });

  function loadTrack() {
    const track = tracks[index], path = track.shard + '/' + filename(track);
    pendingPosition = true;
    audio.src = useOriginal ? commons + path : commons + 'transcoded/' + path + '/' + filename(track) + '.mp3';
  }
  function start() {
    if (!audio.hasAttribute('src') || audio.error) loadTrack();
    audio.play().catch(show);
    show();
  }
  function seekTo(seconds) {
    heldPosition = Math.max(0, Math.min(seconds, duration()));
    if (audio.readyState >= 1 && audio.currentSrc === audio.src) {
      audio.currentTime = heldPosition;
      pendingPosition = false;
    }
    remember();
    showTime();
  }
  function changeTrack(direction = 1) {
    const continuePlaying = wanted && (!audio.muted || audio.hasAttribute('src'));
    index = (index + direction + tracks.length) % tracks.length;
    heldPosition = tracks[index].cue;
    pendingPosition = true;
    useOriginal = false;
    if (continuePlaying) {
      loadTrack();start();
    } else {
      audio.removeAttribute('src');audio.load();show();
    }
    remember();
  }
  for (const [selector, direction] of [['#music-prev', -1], ['#music-next', 1]]) {
    document.querySelector(selector).onclick = () => { failedTracks = 0; changeTrack(direction); };
  }
  document.querySelector('#music-rewind').onclick = () => seekTo(position() - 10);
  document.querySelector('#music-forward').onclick = () => seekTo(position() + 10);

  audio.addEventListener('loadedmetadata', () => {
    if (pendingPosition && audio.currentSrc === audio.src) seekTo(heldPosition);
  });
  audio.addEventListener('timeupdate', () => {
    if (!pendingPosition && audio.readyState >= 1) {
      heldPosition = audio.currentTime;
      if (wanted && performance.now() - lastWrite >= 4000) remember();
    }
    showTime();
  });
  audio.addEventListener('playing', () => { failedTracks = 0; show(); });
  audio.addEventListener('pause', show);
  audio.addEventListener('ended', () => { if (wanted) changeTrack(); });
  audio.addEventListener('error', () => {
    if (!wanted || !audio.error || !audio.hasAttribute('src')) return;
    if (!useOriginal) {
      useOriginal = true;loadTrack();start();
    } else if (++failedTracks < tracks.length) {
      changeTrack();
    } else {
      wanted = false;pendingPosition = true;
      audio.removeAttribute('src');audio.load();remember();show();
    }
  });
  play.onclick = () => {
    if (!audio.paused) {
      wanted = false;audio.pause();remember();show();return;
    }
    wanted = true;failedTracks = 0;
    if (!audio.hasAttribute('src')) useOriginal = false;
    if (position() >= duration()) changeTrack();
    else start();
    remember();
  };
  mute.onclick = () => {
    audio.muted = !audio.muted;
    saveMute(audio.muted);
    if (!audio.muted && wanted && audio.paused) start();
    show();
  };
  function unlock(event) {
    if (wanted && !audio.muted && audio.paused && !radio.contains(event.target)) start();
  }
  for (const event of ['pointerup','keydown','click']) document.addEventListener(event, unlock, true);
  window.addEventListener('pagehide', remember);
  document.addEventListener('visibilitychange', () => { if (document.hidden) remember(); });
  show();
  if (wanted && !audio.muted) start();
  return {
    get muted() { return audio.muted; },
    state() { return { track: tracks[index].title, playing: !audio.paused, muted: audio.muted, seconds: Math.floor(position()) }; }
  };
}
