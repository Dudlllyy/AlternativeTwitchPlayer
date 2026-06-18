
const urlParams = new URLSearchParams(window.location.search);
const channelName = urlParams.get('channel');


function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hDisplay = hours > 0 ? hours + ":" : "";
    const mDisplay = (minutes < 10 && hours > 0 ? "0" : "") + minutes + ":";
    const sDisplay = seconds < 10 ? "0" + seconds : seconds;

    return hDisplay + mDisplay + sDisplay;
}

async function loadVods() {
    if (!channelName) {
        document.getElementById('vodGrid').innerHTML = '<div style="color: red; padding: 20px;">Error: Channel not specified in URL!</div>';
        return;
    }

    document.getElementById('vodChannelName').innerText = channelName;
    const grid = document.getElementById('vodGrid');

    try {

        const response = await fetch(`/api/vods?channel=${channelName}`);

        if (!response.ok) {
            throw new Error("Failed to retrieve data from the server");
        }

        const data = await response.json();
        const edges = data.data.user.videos.edges;

        if (edges.length === 0) {
            grid.innerHTML = '<div style="color: gray; padding: 20px; font-size: 18px;">This channel has no saved VODs.</div>';
            return;
        }

        grid.innerHTML = edges.map(edge => {
            const video = edge.node;
            const duration = formatTime(video.lengthSeconds);
            const dateStr = new Date(video.createdAt).toLocaleDateString();


            const thumbUrl = video.previewThumbnailURL ? video.previewThumbnailURL : 'https://vod-secure.twitch.tv/assets/default_vod_thumb-320x180.jpg';

            return `
                <div class="vod-card" onclick="openVodPlayer('${video.id}')">
                    <div class="vod-thumb-wrapper">
                        <img class="vod-thumb" src="${thumbUrl}" alt="Thumbnail">
                        <span class="vod-duration">${duration}</span>
                    </div>
                    <div class="vod-info">
                        <div class="vod-title" title="${video.title}">${video.title}</div>
                        <div class="vod-date">📅 ${dateStr}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        grid.innerHTML = `<div style="color: #ff4a4a; padding: 20px;">Error loading records. Check if the Python server is running.</div>`;
    }
}


function openVodPlayer(videoId) {

    window.location.href = `vod_player.html?video=${videoId}&channel=${channelName}`;
}


loadVods();
