import { YoutubeTranscript } from 'youtube-transcript';

const videoId = 'ye52GV--wo8';

async function main() {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  console.log(transcript.slice(0, 5));
}

main().catch(console.error);