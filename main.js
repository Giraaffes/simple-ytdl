require("express-async-errors");

const express = require("express");
const ytdl = require("ytdl-core");
const cp = require("child_process");
const ffmpegPath = require("ffmpeg-static");

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

server.get(["/video", "/audio"], async (req, res, next) => {
	let title = (await ytdl.getBasicInfo(req.query.url)).videoDetails.title;
	let ext = (req.path == "/video" ? "mp4" : "mp3");
	res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(title)}.${ext}"`);
	next();
})

server.get("/video", (req, res, next) => {
	let { url, audio = "highestaudio", video = "highestvideo", disallowHD } = req.query;

	let audioStream = ytdl(url, {
		quality: audio, 
		filter: disallowHD && (f => f.audioBitrate <= 128)
	}).on("error", next);
	let videoStream = ytdl(url, {
		quality: video, 
		filter: disallowHD && (f => f.qualityLabel != "1080p")
	}).on("error", next);

	// Thanks to https://github.com/redbrain/ytdl-core-muxer/blob/main/index.js
	let ffmpegProcess = cp.spawn(ffmpegPath, [
		"-i", "pipe:3", "-i", "pipe:4",
		"-map", "0:a", "-map", "1:v",
		"-c", "copy",
		"-movflags", "+frag_keyframe",
		"-f", "mp4", "pipe:5"
	], {
		windowsHide: true,
		stdio: [
			"inherit", "inherit", "inherit",
			"pipe", "pipe", "pipe"
		]
	});
	audioStream.pipe(ffmpegProcess.stdio[3]);
	videoStream.pipe(ffmpegProcess.stdio[4]);

	ffmpegProcess.stdio[5].pipe(res);
});

server.get("/audio", (req, res, next) => {
	let { url, audio = "highestaudio" } = req.query;
	ytdl(url, {quality: audio}).on("error", next).pipe(res);
});

server.use((err, req, res, next) => {
	res.removeHeader("Content-Disposition");
	let timeStr = (new Date()).toLocaleString({timeZone: "Europe/Copenhagen"});
  console.error(timeStr, req.url, err);

  res.status(500).send("<title>Fejl</title>Beklager, der opstod en fejl...").end();
})


server.listen(5000, "127.0.0.1", () => {
	console.log("Ready");
});