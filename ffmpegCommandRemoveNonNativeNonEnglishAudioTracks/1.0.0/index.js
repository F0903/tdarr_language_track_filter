"use strict";

const details = () => ({
  name: "Remove Non-Native Non-English Audio Tracks",
  description: `Removes audio tracks that are not in the native language or are not English.
    Native language is determined by the Sonarr/Radarr API.
    This plugin also sets the audio track with the native language as the default track.`,
  tags: "audio",
  style: {
    borderColor: "green",
  },
  isStartPlgin: false,
  pType: "",
  requiresVersion: "2.11.01",
  sidebarPosition: -1,
  icon: "",
  inputs: [
    {
      name: "provider",
      type: "string",
      defaultValue: "Sonarr",
      inputUI: {
        type: "dropdown",
        options: ["Sonarr", "Radarr"],
      },
      tooltip:
        "Select the metadata provider, which is either Radarr or Sonarr.",
    },
    {
      name: "radarr_api_key",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text",
        displayConditions: {
          logic: "AND",
          sets: {
            logic: "AND",
            inputs: {
              name: "provider",
              value: "Radarr",
              condition: "===",
            },
          },
        },
      },
      tooltip: "Input your Radarr api key here.",
    },
    {
      name: "radarr_url",
      type: "string",
      defaultValue: "http://192.168.1.2:7878",
      inputUI: {
        type: "text",
        displayConditions: {
          logic: "AND",
          sets: {
            logic: "AND",
            inputs: {
              name: "provider",
              value: "Radarr",
              condition: "===",
            },
          },
        },
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
        displayConditions: {
          logic: "AND",
          sets: {
            logic: "AND",
            inputs: {
              name: "provider",
              value: "Sonarr",
              condition: "===",
            },
          },
        },
      },
      tooltip: "Input your Sonarr api key here.",
    },
    {
      name: "sonarr_url",
      type: "string",
      defaultValue: "http://192.168.1.2:8989",
      inputUI: {
        type: "text",
        displayConditions: {
          logic: "AND",
          sets: {
            logic: "AND",
            inputs: {
              name: "provider",
              value: "Sonarr",
              condition: "===",
            },
          },
        },
      },
      tooltip:
        "Input your full Sonarr url here." +
        "\\nExample:\\n" +
        "http://192.168.1.2:8989\\n" +
        "https://sonarr.example.com",
    },
  ],
  outputs: [
    {
      number: 1,
      tooltip: "Ran successfully. Continue to the next plugin.",
    },
  ],
});

const log = (message) => console.log(message);

const extractTmdbId = (str) => {
  log("Extracting TMDB ID from string:", str);

  // Matches [tmdbid-<id>] where <id> is one or more digits
  const match = str.match(/\[tmdbid-(\d+)\]/i);
  return match ? match[1] : null;
};

const extractTvdbId = (str) => {
  log("Extracting TVDB ID from string:", str);

  // Matches [tvdbid-<id>] where <id> is one or more digits
  const match = str.match(/\[tvdbid-(\d+)\]/i);
  return match ? match[1] : null;
};

const filterAudioTracks = (args, langsToKeep, nativeLanguage) => {
  log("Filtering audio tracks for file: ", args.inputFileObj._id);
  log("Languages to keep: ", langsToKeep);

  let nativeStream = null;

  for (const stream of args.variables.ffmpegCommand.streams) {
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

    if (!nativeStream && language === nativeLanguage) {
      nativeStream = stream;
      log(
        `Found native language stream '${language}' with index ${nativeIndex}`
      );
      continue;
    }

    stream.removed = true;
    log(
      `Removed stream with index '${stream.index}' and language '${language}'`
    );
  }

  if (nativeStream) {
    // Set the native language stream as default
    nativeStream.outputArgs.push(
      `-disposition:a 0 -disposition:a:${nativeStream.index} 1`
    );
    log(
      `Setting native language stream with index '${nativeStream.index}' and language '${nativeLanguage}' as default.`
    );
  }
};

const do_sonarr = async (args) => {
  const sonarrApiKey = args.inputs.sonarr_api_key;
  if (!sonarrApiKey) {
    log("Sonarr API key is not set!");
    throw new Error("Sonarr API key is not set!");
  }

  let filePath = args.inputFileObj._id;
  let tvdbId = extractTvdbId(filePath);
  if (!tvdbId) {
    log("TVDB ID not found in file name:", filePath);
    throw new Error("TVDB ID not found in file name.");
  }

  const seriesEndpoint = new URL("/api/v3/series", args.inputs.sonarr_url);
  seriesEndpoint.searchParams.append("tvdbid", tvdbId);
  seriesEndpoint.searchParams.append("includeSeasonImages", false);

  const response = await fetch(seriesEndpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sonarrApiKey}`,
    },
  });
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
    args,
    [nativeLanguageThreeLetters, "eng"],
    nativeLanguageThreeLetters
  );
};

const do_radarr = async (args) => {
  const radarrApiKey = args.inputs.radarr_api_key;
  if (!radarrApiKey) {
    log("Radarr API key is not set!");
    throw new Error("Radarr API key is not set!");
  }

  let filePath = args.inputFileObj._id;
  let tmdbId = extractTmdbId(filePath);
  if (!tmdbId) {
    log("TMDB ID not found in file name:", filePath);
    throw new Error("TMDB ID not found in file name.");
  }

  const radarrUrl = args.inputs.radarr_url;

  //TODO: Implement
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const plugin = async (args) => {
  const lib = require("../../../../../methods/lib")();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
  args.inputs = lib.loadDefaultValues(args.inputs, details);

  const strategies = [("sonarr", do_sonarr), ("radarr", do_radarr)];
  for (const [strategy, func] of strategies) {
    if (args.inputs.provider.toLowerCase() === strategy) {
      await func(args);
      break;
    }
  }

  return {
    outputFileObj: args.inputFileObj,
    outputNumber: 1,
    variables: args.variables,
  };
};

module.exports.dependencies = ["langs@2.0.0"];
module.exports.details = details;
module.exports.plugin = plugin;
