"use strict";

const details = () => ({
  name: "Remove Non-Native Non-English Audio Tracks",
  description: `Removes audio tracks that are not in the native language or are not English.
    Native language is determined by the Sonarr/Radarr API.
    This plugin also sets the audio track with the native language as the default track.`,
  tags: "audio",
  style: {
    borderColor: "#6efefc",
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
          sets: [
            {
              logic: "AND",
              inputs: [
                {
                  name: "provider",
                  value: "Radarr",
                  condition: "===",
                },
              ],
            },
          ],
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
          sets: [
            {
              logic: "AND",
              inputs: [
                {
                  name: "provider",
                  value: "Radarr",
                  condition: "===",
                },
              ],
            },
          ],
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
          sets: [
            {
              logic: "AND",
              inputs: [
                {
                  name: "provider",
                  value: "Sonarr",
                  condition: "===",
                },
              ],
            },
          ],
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
          sets: [
            {
              logic: "AND",
              inputs: [
                {
                  name: "provider",
                  value: "Sonarr",
                  condition: "===",
                },
              ],
            },
          ],
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

const extractTmdbId = (str) => {
  // Matches [tmdbid-<id>] where <id> is one or more digits
  const match = str.match(/\[tmdbid-(\d+)\]/i);
  return match ? match[1] : null;
};

const extractTvdbId = (str) => {
  // Matches [tvdbid-<id>] where <id> is one or more digits
  const match = str.match(/\[tvdbid-(\d+)\]/i);
  return match ? match[1] : null;
};

const filterAudioTracks = (args, langsToKeep, nativeLanguage) => {
  args.jobLog("Filtering audio tracks for file: " + args.inputFileObj._id);
  args.jobLog("Languages to keep: " + langsToKeep);

  let hadValidStream = false;
  let nativeStream = null;

  for (const stream of args.variables.ffmpegCommand.streams) {
    args.jobLog("Processing stream: " + stream.index);

    if (stream.codec_type !== "audio") {
      args.jobLog("Stream is not audio, skipping");
      continue;
    }

    if (!stream.tags) {
      args.jobLog("Stream has no tags, skipping");
      continue;
    }

    const streamLanguage = stream.tags.language;
    if (!streamLanguage) {
      args.jobLog("Stream has no language tag, skipping");
      continue;
    }

    if (langsToKeep.includes(streamLanguage)) {
      if (!nativeStream && streamLanguage === nativeLanguage) {
        nativeStream = stream;
        args.jobLog(
          `Found native language stream '${streamLanguage}' with index ${nativeStream.index}`
        );
      } else {
        // We only need to check for this if the stream is not native language.
        // If the stream is not an allowed language at all, it will be removed anyway.
        if (stream.disposition && stream.disposition.default) {
          args.jobLog(
            `Stream is not native language but marked as default. Clearing...`
          );
          stream.outputArgs.push(`-disposition:a:${stream.index} 0`);
        }
      }

      args.jobLog(
        `Keeping stream with index '${stream.index}' and language '${streamLanguage}' since it is in the allowed languages.`
      );
      hadValidStream = true;
      continue;
    }

    stream.removed = true;
    args.jobLog(
      `Removed stream with index '${stream.index}' and language '${streamLanguage}'`
    );
  }

  if (!hadValidStream) {
    const err =
      "No valid audio streams with neither native language nor English found in file!";
    args.jobLog(err);
    throw new Error(err);
  }

  if (nativeStream) {
    // Set the native language stream as default
    nativeStream.outputArgs.push(
      `-disposition:a:${nativeStream.index} default`
    );
    args.jobLog(
      `Setting native language stream with index '${nativeStream.index}' and language '${nativeLanguage}' as default.`
    );
  }
};

const handle_media_response = (args, mediaJson) => {
  const langs = require("langs");

  const nativeLanguage = mediaJson.originalLanguage.name;
  args.jobLog(`Found native language in media: ${nativeLanguage}`);

  const nativeLanguageCode = langs.where("name", nativeLanguage);
  if (!nativeLanguageCode) {
    const err = `Could not get language code for '${nativeLanguage}'! Language was not found.`;
    args.jobLog(err);
    throw new Error(err);
  }

  const nativeLanguageThreeLetters = nativeLanguageCode[3];
  args.jobLog(
    `Native language three-letter code: ${nativeLanguageThreeLetters}`
  );

  filterAudioTracks(
    args,
    [nativeLanguageThreeLetters, "eng"],
    nativeLanguageThreeLetters
  );
};

const do_sonarr = async (args) => {
  args.jobLog("Running Sonarr strategy...");

  const sonarrApiKey = args.inputs.sonarr_api_key;
  if (!sonarrApiKey) {
    args.jobLog("Sonarr API key is not set!");
    throw new Error("Sonarr API key is not set!");
  }

  let filePath = args.inputFileObj._id;
  let tvdbId = extractTvdbId(filePath);
  if (!tvdbId) {
    args.jobLog("TVDB ID not found in file name: " + filePath);
    throw new Error("TVDB ID not found in file name.");
  }

  const seriesEndpoint = new URL("/api/v3/series", args.inputs.sonarr_url);
  seriesEndpoint.searchParams.append("tvdbid", tvdbId);
  seriesEndpoint.searchParams.append("includeSeasonImages", "false");

  args.jobLog("Fetching series data from Sonarr: " + seriesEndpoint.href);
  const response = await fetch(seriesEndpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sonarrApiKey}`,
    },
  });
  if (!response.ok) {
    args.jobLog(
      "Failed to fetch series data from Sonarr: " + response.statusText
    );
    throw new Error("Failed to fetch series data from Sonarr.");
  }

  const responseJson = await response.json();
  const series = responseJson[0];
  if (!series) {
    args.jobLog("Series not found:" + tvdbId);
    throw new Error("Series not found.");
  }
  args.jobLog("Fetched series data from Sonarr: " + series);

  handle_media_response(args, series);
};

const do_radarr = async (args) => {
  args.jobLog("Running Radarr strategy...");

  const radarrApiKey = args.inputs.radarr_api_key;
  if (!radarrApiKey) {
    args.jobLog("Radarr API key is not set!");
    throw new Error("Radarr API key is not set!");
  }

  let filePath = args.inputFileObj._id;
  let tmdbid = extractTmdbId(filePath);
  if (!tmdbid) {
    args.jobLog("TMDB ID not found in file name: " + filePath);
    throw new Error("TMDB ID not found in file name.");
  }

  const movieEndpoint = new URL("/api/v3/movie", args.inputs.radarr_url);
  movieEndpoint.searchParams.append("tmdbid", tmdbid);
  movieEndpoint.searchParams.append("excludeLocalCovers", "true");

  args.jobLog("Fetching movie data from Radarr: " + movieEndpoint.href);
  const response = await fetch(movieEndpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${radarrApiKey}`,
    },
  });
  if (!response.ok) {
    args.jobLog(
      "Failed to fetch movie data from Radarr: " + response.statusText
    );
    throw new Error("Failed to fetch movie data from Radarr.");
  }

  const responseJson = await response.json();
  const movie = responseJson[0];
  if (!movie) {
    args.jobLog("Movie not found:" + tmdbid);
    throw new Error("Movie not found.");
  }
  args.jobLog("Fetched movie data from Radarr: " + movie);

  handle_media_response(args, movie);
};

const plugin = async (args) => {
  const lib = require("../../../../../methods/lib")();
  args.inputs = lib.loadDefaultValues(args.inputs, details);

  const flowUtils = require("../../../../FlowHelpers/1.0.0/interfaces/flowUtils");
  flowUtils.checkFfmpegCommandInit(args);

  await args.installClassicPluginDeps(["langs@2.0.0"]);

  const strategies = [
    ["sonarr", do_sonarr],
    ["radarr", do_radarr],
  ];
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

module.exports.details = details;
module.exports.plugin = plugin;
