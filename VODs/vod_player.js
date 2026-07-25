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
    else { video.pause(); playPauseBtn.innerText = "▶ Старт"; }
}

speedSelect.addEventListener('change', () => video.playbackRate = parseFloat(speedSelect.value));
document.getElementById('volumeSlider').addEventListener('input', (e) => video.volume = e.target.value);

// ==========================================
// 1. СОХРАНЕНИЕ ПРОГРЕССА В ОБНОВЛЕНИИ ВРЕМЕНИ
// ==========================================
video.addEventListener('timeupdate', () => {
    if (video.duration) {
        progress.max = video.duration;
        progress.value = video.currentTime;
        timeDisplay.innerText = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;

        // Запоминаем текущую секунду в localStorage (если прошло больше 5 сек)
        if (videoId && video.currentTime > 5 && !video.ended) {
            localStorage.setItem(`vod_progress_${videoId}`, Math.floor(video.currentTime));
        }
    }
});

// Если досмотрели до конца — стираем сохраненный прогресс
video.addEventListener('ended', () => {
    if (videoId) localStorage.removeItem(`vod_progress_${videoId}`);
});

progress.addEventListener('input', () => video.currentTime = progress.value);

// ==========================================
// 2. ДИНАМИЧЕСКИЙ ТУЛЬТИП ДЛЯ ПЕРЕМОТКИ
// ==========================================
const tooltip = document.createElement('div');
tooltip.style.cssText = 'position: absolute; background: rgba(24, 24, 27, 0.95); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; pointer-events: none; display: none; z-index: 1000; border: 1px solid #9146FF; transform: translateX(-50%); bottom: 25px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);';
progress.parentElement.style.position = 'relative';
progress.parentElement.appendChild(tooltip);

progress.addEventListener('mousemove', (e) => {
    const rect = progress.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = pos * (video.duration || 0);

    tooltip.innerText = formatTime(hoverTime);
    tooltip.style.left = `${e.clientX - rect.left}px`;
    tooltip.style.display = 'block';
});

progress.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
});

// ==========================================
// 3. АВТО-СКРЫТИЕ ПАНЕЛИ В FULLSCREEN
// ==========================================
let hideControlsTimeout;
const controls = document.querySelector('.custom-controls');

wrapper.addEventListener('mousemove', () => {
    if (!controls) return;
    controls.style.opacity = '1';
    controls.style.transition = 'opacity 0.3s ease';
    wrapper.style.cursor = 'default';

    clearTimeout(hideControlsTimeout);

    // Если мы в полноэкранном режиме — прячем панель и курсор через 2.5 секунды тишины
    if (document.fullscreenElement) {
        hideControlsTimeout = setTimeout(() => {
            controls.style.opacity = '0';
            wrapper.style.cursor = 'none'; // Прячем курсор мыши, чтобы не мешал смотреть!
        }, 2500);
    }
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        clearTimeout(hideControlsTimeout);
        if (controls) controls.style.opacity = '1';
        wrapper.style.cursor = 'default';
    }
});

// ==========================================
// ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ
// ==========================================
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
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        if (startTime > 0) video.currentTime = startTime;
        video.play();
    }
}

// ==========================================
// ЛОГИКА АУДИО-РЕЖИМА
// ==========================================
audioBtn.addEventListener('click', async () => {
    const savedTime = video.currentTime;

    if (isAudioOnly) {
        isAudioOnly = false;
        wrapper.classList.remove('audio-mode');
        audioBtn.innerText = "🎧 Только аудио";
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
                wrapper.classList.add('audio-mode');
                audioBtn.innerText = "📺 Вернуть видео";
                audioBtn.style.background = "#eb0400";
                qSelect.disabled = true;

                if (!audioUrl.startsWith('http')) {
                    audioUrl = "https://usher.ttvnw.net" + audioUrl;
                }

                // Исправлено: используем относительный путь вместо ${PORT}
                audioUrl = `/api/vod_subfile?url=${encodeURIComponent(audioUrl)}`;
                loadPlayer(audioUrl, savedTime);
            } else {
                alert("Аудиодорожка не найдена (попробуйте обновить страницу).");
            }
        } catch (e) {
            alert("Ошибка аудио-режима");
        }
    }
});

// ФУЛЛСКРИН
function toggleFullscreen() {
    !document.fullscreenElement ? wrapper.requestFullscreen() : document.exitFullscreen();
}

// ЗАПУСК (С ПРОВЕРКОЙ СОХРАНЕННОГО ПРОГРЕССА)
if (videoId) {
    const savedTime = parseInt(localStorage.getItem(`vod_progress_${videoId}`)) || 0;
    loadPlayer(`/api/vod_m3u8?video_id=${videoId}`, savedTime);
}const urlParams = new URLSearchParams(window.location.search);
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
