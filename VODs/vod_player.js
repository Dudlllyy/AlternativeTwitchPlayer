const urlParams = new URLSearchParams(window.location.search);
const videoId = urlParams.get('video');
const channelName = urlParams.get('channel');

const video = document.getElementById('video');
const wrapper = document.getElementById('player-wrapper');
const progress = document.getElementById('vodProgress');
const timeDisplay = document.getElementById('timeDisplay');
const playPauseBtn = document.getElementById('playPauseBtn');
const qSelect = document.getElementById('qualitySelect');
const speedSelect = document.getElementById('speedSelect');
const audioBtn = document.getElementById('audioToggleBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');

let hls;
let isAudioOnly = false;

document.getElementById('vodIdDisplay').innerText = `VOD ID: ${videoId || 'Неизвестно'}`;

document.getElementById('backBtn').onclick = () => {
    window.location.href = channelName ? `vods.html?channel=${channelName}` : 'index.html';
};

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return (h > 0 ? h + ":" : "") + (m < 10 && h > 0 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

function togglePlay() {
    if (video.paused) { video.play(); playPauseBtn.innerText = "⏸ Пауза"; }
    else { video.pause(); playPauseBtn.innerText = "▶ Start"; }
}

speedSelect.addEventListener('change', () => video.playbackRate = parseFloat(speedSelect.value));
document.getElementById('volumeSlider').addEventListener('input', (e) => video.volume = e.target.value);

video.addEventListener('timeupdate', () => {
    if (video.duration) {
        progress.max = video.duration;
        progress.value = video.currentTime;
        timeDisplay.innerText = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
});

progress.addEventListener('input', () => video.currentTime = progress.value);


function loadPlayer(url, startTime = 0) {
    if (Hls.isSupported()) {
        if (hls) hls.destroy();

        const hlsConfig = { maxBufferLength: 20, maxMaxBufferLength: 40 };
        if (startTime > 0) hlsConfig.startPosition = startTime;

        hls = new Hls(hlsConfig);
        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            video.volume = document.getElementById('volumeSlider').value;
            video.playbackRate = parseFloat(speedSelect.value);
            video.play().catch(() => playPauseBtn.innerText = "▶ Старт");

            if (!isAudioOnly) {
                qSelect.style.display = 'inline-block';
                qSelect.innerHTML = '<option value="-1">Авто</option>';
                data.levels.forEach((level, i) => {
                    if (level.height) qSelect.innerHTML += `<option value="${i}">${level.height}p</option>`;
                });
                qSelect.value = "-1";
            }
        });
    }
}


audioBtn.addEventListener('click', async () => {
    const savedTime = video.currentTime;

    if (isAudioOnly) {
        isAudioOnly = false;
        wrapper.classList.remove('audio-mode');
        audioBtn.innerText = "🎧 Audio";
        audioBtn.style.background = "transparent";
        qSelect.disabled = false;
        loadPlayer(`/api/vod_m3u8?video_id=${videoId}`, savedTime);
    } else {
        try {
            const res = await fetch(`/api/vod_m3u8?video_id=${videoId}&audio=1`);
            const text = await res.text();

            const match = text.match(/TYPE=AUDIO.*URI="([^"]+)"/);
            let audioUrl = match ? match[1] : null;

            if (audioUrl) {
                isAudioOnly = true;

                if (!audioUrl.startsWith('http')) {

                    audioUrl = "https://usher.ttvnw.net" + audioUrl;
                }


                audioUrl = `http://localhost:${PORT}/api/vod_subfile?url=${encodeURIComponent(audioUrl)}`;

                loadPlayer(audioUrl, savedTime);
            } else {
                alert("Аудиодорожка не найдена (попробуйте обновить страницу).");
            }
            } catch (e) { alert("Ошибка аудио-режима"); }
        }
    });

// ФУЛЛСКРИН
function toggleFullscreen() {
    !document.fullscreenElement ? wrapper.requestFullscreen() : document.exitFullscreen();
}

if (videoId) loadPlayer(`/api/vod_m3u8?video_id=${videoId}`);
