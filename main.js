require("express-async-errors");

const express = require("express");
const ytdl = require('ytdl-core');
const ffmpegPath = require("ffmpeg-static");
const cp = require("child_process");
const stream = require('stream');

const fs = require("fs");

const server = express();


function filterProps(obj, props) {
	return Object.fromEntries(Object.entries(obj).filter(([k, v]) => props.includes(k)));
}


server.use((req, res, next) => {
	res.set("access-control-allow-origin", "*");
	next();
});

server.get("/info", async (req, res) => {
	let videoInfo = await ytdl.getInfo(req.query.url);
	res.json({
		title: videoInfo.videoDetails.title,
		formats: videoInfo.formats.filter(
			f => f.container == "mp4"
		).map(f => filterProps(f, 
			["itag", "qualityLabel", "audioBitrate"]
		))
	});
});

server.get("/video/*", (req, res) => {
	let { url, audio, video, disallowHD } = req.query;
	let audioStream = ytdl(url, {
		quality: audio, 
		filter: disallowHD && (f => f.audioBitrate <= 128)
	});
	let videoStream = ytdl(url, {
		quality: video, 
		filter: disallowHD && (f => f.qualityLabel != "1080p")
	});

	// https://github.com/redbrain/ytdl-core-muxer/blob/main/index.js
	let ffmpegProcess = cp.spawn(ffmpegPath, [
		// supress non-crucial messages
		'-loglevel', '8', '-hide_banner',
		// input audio and video by pipe
		'-i', 'pipe:3', '-i', 'pipe:4',
		// map audio and video correspondingly
		'-map', '0:a', '-map', '1:v',
		// no need to change the codec
		'-c:v', 'copy', '-c:a', 'libmp3lame',
		// output mkv and pipe (HOW THE FUCK DO I MAKE IT USE MP4!!?!?!)
		'-f', 'matroska', 'pipe:5'
	], {
		// no popup window for Windows users
		windowsHide: true,
		stdio: [
			// silence stdin/out, forward stderr,
			'inherit', 'inherit', 'inherit',
			// and pipe audio, video, output
			'pipe', 'pipe', 'pipe'
		]
	});
	audioStream.pipe(ffmpegProcess.stdio[3]);
	videoStream.pipe(ffmpegProcess.stdio[4]);

	ffmpegProcess.stdio[5].pipe(res);
});

server.use((err, req, res, next) => {
	let timeStr = (new Date()).toLocaleString({timeZone: "Europe/Copenhagen"});
  console.error(timeStr, req.url, err);

  res.status(500).send("<title>Fejl</title>Beklager, der opstod en fejl...").end();
})


server.listen(5000, "127.0.0.1", () => {
	console.log("Ready");
});