// These are the CC BY recordings from Alleys of Istanbul. Only the current
// track gets a media URL, so the other three consume no bandwidth.
const tracks = [
  { title: 'Muhabbet', file: '10_-_-Muhabet', shard: 'f/fa', cue: 45 },
  { title: 'Anadolu Kavağı', file: '04_-_-Anadolu_Kavagi', shard: '8/8b', cue: 0 },
  { title: 'Bir Demet Yasemen', file: '14_-_-Bir_Demet_Yasemen', shard: 'b/bd', cue: 0 },
  { title: 'Üsküdar’a Gider İken', file: '01_-_-Uskudara_Gideriken', shard: '4/41', cue: 0 }
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

export function mountMusic(initiallyMuted, saveMute) {
  const audio = document.querySelector('#soundtrack');
  const play = document.querySelector('#music-play');
  const mute = document.querySelector('#audio');
  const name = document.querySelector('#track-name');
  let index = 0, wanted = true, useOriginal = false, failedTracks = 0;
  audio.volume = 0.28;
  audio.muted = initiallyMuted;

  function show() {
    const title = tracks[index].title;
    const action = !audio.paused ? 'Müziği durdur' : failedTracks === tracks.length ? 'Yeniden dene' : 'Müziği çal';
    play.dataset.playing = String(!audio.paused);
    play.title = action + ' · ' + title;
    play.setAttribute('aria-label', play.title);
    mute.dataset.muted = String(audio.muted);
    mute.title = audio.muted ? 'Sesi aç' : 'Sesi kapat';
    mute.setAttribute('aria-label', mute.title);
    if (name.textContent !== title) name.textContent = title;
  }

  function loadTrack() {
    const track = tracks[index];
    const path = track.shard + '/' + filename(track);
    const url = useOriginal ? commons + path : commons + 'transcoded/' + path + '/' + filename(track) + '.mp3';
    audio.src = url + (track.cue ? '#t=' + track.cue : '');
  }

  function start() {
    if (!audio.hasAttribute('src')) loadTrack();
    // A blocked autoplay can be retried by an ordinary game gesture.
    // Source changes and stop also reject outstanding play promises.
    audio.play().catch(show);
    show();
  }

  function stop() {
    wanted = false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    show();
  }

  function changeTrack(direction = 1) {
    index = (index + direction + tracks.length) % tracks.length;
    useOriginal = false;
    if (wanted && (!audio.muted || audio.hasAttribute('src'))) {
      loadTrack();
      start();
    } else {
      show();
    }
  }

  for (const [selector, direction] of [['#music-prev', -1], ['#music-next', 1]]) {
    document.querySelector(selector).onclick = () => {
      failedTracks = 0;
      changeTrack(direction);
    };
  }

  audio.addEventListener('loadedmetadata', () => {
    const cue = tracks[index].cue;
    if (cue && audio.currentTime < cue) audio.currentTime = cue;
  });
  audio.addEventListener('playing', () => { failedTracks = 0; show(); });
  audio.addEventListener('pause', show);
  audio.addEventListener('ended', () => { if (wanted) changeTrack(); });
  audio.addEventListener('error', () => {
    if (!wanted || !audio.error || !audio.hasAttribute('src')) return;
    if (!useOriginal) {
      useOriginal = true;
      loadTrack();
      start();
    } else if (++failedTracks < tracks.length) {
      changeTrack();
    } else {
      stop();
    }
  });

  play.onclick = () => {
    if (!audio.paused) return stop();
    wanted = true;
    failedTracks = 0;
    if (!audio.hasAttribute('src')) useOriginal = false;
    start();
  };
  mute.onclick = () => {
    audio.muted = !audio.muted;
    saveMute(audio.muted);
    if (!audio.muted && wanted && audio.paused) start();
    show();
  };
  function unlock(event) {
    if (wanted && !audio.muted && audio.paused && !event.target.closest?.('#radio')) start();
  }
  for (const event of ['pointerup', 'keydown', 'click']) document.addEventListener(event, unlock, true);
  show();
  if (!audio.muted) start();
  return {
    get muted() { return audio.muted; },
    state() { return { track: tracks[index].title, playing: !audio.paused, muted: audio.muted, seconds: Math.floor(audio.currentTime) }; }
  };
}
