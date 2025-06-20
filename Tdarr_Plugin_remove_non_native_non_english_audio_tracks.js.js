const details = () => ({
  id: "Tdarr_Plugin_F0903_remove_non_native_non_english_audio_tracks",
  Stage: "Pre-processing",
  Name: "Remove Non-Native Non-English Audio Tracks",
  Type: "Audio",
  Operation: "Transcode",
  Description: `Removes audio tracks that are not in the native language or are not English.
    Native language is determined by the Sonarr/Radarr API.
    This plugin also sets the audio track with the native language as the default track.`,
  Version: "0.1",
  Tags: "pre-processing,configurable",
  Inputs: [
    {
      name: "priority",
      type: "string",
      defaultValue: "Sonarr",
      inputUI: {
        type: "text",
      },
      tooltip:
        "Priority for either Radarr or Sonarr. Leaving it empty defaults to Sonarr first." +
        "\\nExample:\\n" +
        "Sonarr",
    },
    {
      name: "radarr_api_key",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text",
      },
      tooltip: "Input your Radarr api key here.",
    },
    {
      name: "radarr_url",
      type: "string",
      defaultValue: "http://192.168.1.2:7878",
      inputUI: {
        type: "text",
      },
      tooltip:
        "Input your full Radarr url here." +
        "\\nExample:\\n" +
        "http://192.168.1.2:7878\\n" +
        "https://radarr.example.com",
    },
    {
      name: "sonarr_api_key",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text",
      },
      tooltip: "Input your Sonarr api key here.",
    },
    {
      name: "sonarr_url",
      type: "string",
      defaultValue: "http://192.168.1.2:8989",
      inputUI: {
        type: "text",
      },
      tooltip:
        "Input your full Sonarr url here." +
        "\\nExample:\\n" +
        "http://192.168.1.2:8989\\n" +
        "https://sonarr.example.com",
    },
  ],
});

const response = {
  processFile: false,
  // Start by including all streams by default.
  preset: ", -map 0 ",
  container: ".",
  handBrakeMode: false,
  FFmpegMode: true,
  reQueueAfter: false,
  infoLog: "",
};

const log = (message) => {
  response.infoLog += message + "\n";
};

const extractTvdbId = (str) => {
  log("Extracting TVDB ID from string:", str);

  // Matches [tvdbid-<id>] where <id> is one or more digits
  const match = str.match(/\[tvdbid-(\d+)\]/i);
  return match ? match[1] : null;
};

const filterAudioTracks = (file, langsToKeep, nativeLanguage) => {
  log("Filtering audio tracks for file: ", file._id);
  log("Languages to keep: ", langsToKeep);

  let nativeIndex = -1;

  for (const stream of file.ffProbeData.streams) {
    log("Processing audio stream: ", stream.index);

    if (stream.codec_type !== "audio") {
      log("Stream is not audio, skipping");
      continue;
    }

    if (!stream.tags) {
      log("Stream has no tags, skipping");
      continue;
    }

    const language = stream.tags.language;
    if (!language) {
      log("Stream has no language tag, skipping");
      continue;
    }

    if (nativeIndex !== -1 && language === nativeLanguage) {
      nativeIndex = stream.index;
      log(
        `Found native language stream '${language}' with index ${nativeIndex}`
      );
      continue;
    }

    response.preset += `-map -0:a:${stream.index} `;
    log(
      `Removed stream with index '${stream.index}' and language '${language}'`
    );
  }

  if (nativeIndex !== -1) {
    response.preset += `-disposition:a 0 -disposition:a:${nativeIndex} 1`;
    log(
      `Setting native language stream with index '${nativeIndex}' and language '${nativeLanguage}' as default.`
    );
  }
  response.preset += " -c copy";
  log("Final preset: ", response.preset);
};

const do_sonarr = async (inputs, file) => {
  const sonarrApiKey = inputs.sonarr_api_key;
  if (!sonarrApiKey) {
    log("Sonarr API key is not set!");
    throw new Error("Sonarr API key is not set!");
  }

  let filePath = file._id;
  let tvdbId = extractTvdbId(filePath);
  if (!tvdbId) {
    log("TVDB ID not found in file name:", filePath);
    throw new Error("TVDB ID not found in file name.");
  }

  const seriesEndpoint = new URL("/api/v3/series", inputs.sonarr_url);
  seriesEndpoint.searchParams.append("tvdbid", tvdbId);
  seriesEndpoint.searchParams.append("includeSeasonImages", false);

  const response = await fetch(seriesEndpoint);
  if (!response.ok) {
    log("Failed to fetch series data from Sonarr:", response.statusText);
    throw new Error("Failed to fetch series data from Sonarr.");
  }

  const responseJson = await response.json();
  const series = responseJson[0];
  if (!series) {
    log("Series not found:", tvdbId);
    throw new Error("Series not found.");
  }
  log("Fetched series data from Sonarr: ", series);

  const langs = require("langs");
  const nativeLanguage = series.originalLanguage.name;
  let nativeLanguageThreeLetters = langs.where("name", nativeLanguage)[3];
  filterAudioTracks(
    file,
    [nativeLanguageThreeLetters, "eng"],
    nativeLanguageThreeLetters
  );
};

const do_radarr = async (inputs, file) => {
  const radarrApiKey = inputs.radarr_api_key;
  if (!radarrApiKey) {
    log("Radarr API key is not set!");
    throw new Error("Radarr API key is not set!");
  }

  let filePath = file._id;
  let tvdbId = extractTvdbId(filePath);
  if (!tvdbId) {
    log("TVDB ID not found in file name:", filePath);
    throw new Error("TVDB ID not found in file name.");
  }

  const radarrUrl = inputs.radarr_url;

  //TODO: Implement
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = async (file, librarySettings, inputs, otherArguments) => {
  const lib = require("../methods/lib")();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
  inputs = lib.loadDefaultValues(inputs, details);

  const strategies = [("sonarr", do_sonarr), ("radarr", do_radarr)];
  for (const [strategy, func] of strategies) {
    if (inputs.priority.toLowerCase() === strategy) {
      await func(inputs, file._id);
    }
  }

  return response;
};

module.exports.dependencies = ["langs@2.0.0"];
module.exports.details = details;
module.exports.plugin = plugin;
