require("express-async-errors");

const express = require("express");
const ytdl = require("ytdl-core");
const cp = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const server = express();


function filterProps(obj, props) {
	return Object.fromEntries(Object.entries(obj).filter(([k, v]) => props.includes(k)));
}

const filesizeUnits = ["", "KB", "MB", "GB", "TB"];
function formatFileSize(bytes) {
	let roundedLog1024 = Math.floor(Math.log2(bytes) / 10);
	let unitDiv = Math.pow(2, roundedLog1024 * 10);
	
	let byteUnits = (bytes / unitDiv).toString().match(/^\d+(?:\.\d|$)/)[0];
	let unit = filesizeUnits[roundedLog1024];
	return `${byteUnits}${unit}`;
}


server.use((req, res, next) => {
	res.set("access-control-allow-origin", "*");
	next();
});

server.get("/info", async (req, res) => {
	let videoInfo = await ytdl.getInfo(req.query.url);
	res.json({
		title: videoInfo.videoDetails.title,
		formats: videoInfo.formats.map(f => filterProps(f, 
			["itag", "qualityLabel", "audioBitrate"]
		))
	});
});

server.get("/video", async (req, res, next) => {
	let { url, audio = "highestaudio", video = "highestvideo", disallowHD } = req.query;

	let { formats } = await ytdl.getInfo(url);
	let audioFormat = ytdl.chooseFormat(formats, {
		quality: audio, 
		filter: disallowHD && (f => f.audioBitrate <= 128)
	});
	let videoFormat = ytdl.chooseFormat(formats, {
		quality: video, 
		filter: disallowHD && (f => f.height <= 720 && f.fps <= 30)
	});

	let title = (await ytdl.getBasicInfo(req.query.url)).videoDetails.title;
	let approxFileSize = formatFileSize(parseInt(audioFormat.contentLength) + parseInt(videoFormat.contentLength));
	res.set("Content-Disposition", `attachment; filename="[${approxFileSize}] ${encodeURIComponent(title)}.ext"`);

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
	ytdl(url, {format: audioFormat}).on("error", next).pipe(ffmpegProcess.stdio[3]);
	ytdl(url, {format: videoFormat}).on("error", next).pipe(ffmpegProcess.stdio[4]);

	ffmpegProcess.stdio[5].pipe(res);
});

server.get("/audio", async (req, res, next) => {
	let title = (await ytdl.getBasicInfo(req.query.url)).videoDetails.title;
	res.set("Content-Disposition", `attachment; filename="${encodeURIComponent(title)}.ext"`);

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